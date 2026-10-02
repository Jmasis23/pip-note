use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug,thiserror::Error)]
pub enum RepoError{
  #[error(transparent)] Db(#[from] rusqlite::Error),
  #[error("revision_conflict")] RevisionConflict,
  #[error("not_found")] NotFound,
  #[error(transparent)] Json(#[from] serde_json::Error)
}

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ChecklistItem{ pub id:String,pub text:String,pub done:bool,pub order:i64 }

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Note{
  pub id:String,pub title:String,pub body:String,pub kind:String,pub checklist:Vec<ChecklistItem>,
  pub pinned:bool,pub deleted_at:Option<String>,pub created_at:String,pub updated_at:String,pub revision:i64
}

#[derive(Debug,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct CreateNoteInput{ pub title:String,pub body:String }

#[derive(Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Draft{ pub id:String,pub title:String,pub body:String,pub updated_at:String }

#[derive(Debug,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct DraftInput{ pub title:String,pub body:String }

pub struct AppRepo{ conn:Connection }

impl AppRepo{
  pub fn open(path:impl AsRef<Path>)->Result<Self,RepoError>{
    let conn=Connection::open(path)?;
    let repo=Self{conn}; repo.migrate()?; Ok(repo)
  }

  fn migrate(&self)->Result<(),RepoError>{
    self.conn.execute_batch(r#"
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS notes(
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'text',
        checklist_json TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS drafts(
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    "#)?;
    Ok(())
  }

  pub fn create_note(&self,input:CreateNoteInput)->Result<Note,RepoError>{
    let now=Utc::now().to_rfc3339();
    let note=Note{
      id:uuid::Uuid::new_v4().to_string(),title:input.title,body:input.body,kind:"text".into(),checklist:vec![],
      pinned:false,deleted_at:None,created_at:now.clone(),updated_at:now,revision:1
    };
    self.conn.execute("INSERT INTO notes(id,title,body,kind,checklist_json,pinned,deleted_at,created_at,updated_at,revision) VALUES(?1,?2,?3,?4,?5,0,NULL,?6,?7,1)",
      params![note.id,note.title,note.body,note.kind,"[]",note.created_at,note.updated_at])?;
    Ok(note)
  }

  fn row_note(row:&rusqlite::Row)->rusqlite::Result<Note>{
    let raw:String=row.get(4)?;
    Ok(Note{
      id:row.get(0)?,title:row.get(1)?,body:row.get(2)?,kind:row.get(3)?,
      checklist:serde_json::from_str(&raw).unwrap_or_default(),pinned:row.get::<_,i64>(5)?!=0,
      deleted_at:row.get(6)?,created_at:row.get(7)?,updated_at:row.get(8)?,revision:row.get(9)?
    })
  }

  pub fn list_notes(&self,filter:&str,query:&str)->Result<Vec<Note>,RepoError>{
    let mut stmt=self.conn.prepare("SELECT id,title,body,kind,checklist_json,pinned,deleted_at,created_at,updated_at,revision FROM notes ORDER BY updated_at DESC")?;
    let all=stmt.query_map([],Self::row_note)?.collect::<Result<Vec<_>,_>>()?;
    let q=query.trim().to_lowercase();
    let today=chrono::Local::now().date_naive();
    Ok(all.into_iter().filter(|n|{
      let view=match filter{
        "trash"=>n.deleted_at.is_some(),
        "pinned"=>n.deleted_at.is_none()&&n.pinned,
        "today"=> n.deleted_at.is_none() && (
          chrono::DateTime::parse_from_rfc3339(&n.created_at).map(|d|d.with_timezone(&chrono::Local).date_naive()==today).unwrap_or(false) ||
          chrono::DateTime::parse_from_rfc3339(&n.updated_at).map(|d|d.with_timezone(&chrono::Local).date_naive()==today).unwrap_or(false)
        ),
        _=>n.deleted_at.is_none()
      };
      let text=format!("{} {}",n.title,n.body).to_lowercase();
      view && (q.is_empty()||text.contains(&q))
    }).collect())
  }

  pub fn update_note(&self,mut note:Note)->Result<Note,RepoError>{
    let current:i64=self.conn.query_row("SELECT revision FROM notes WHERE id=?1",params![note.id],|r|r.get(0)).optional()?.ok_or(RepoError::NotFound)?;
    if current!=note.revision{return Err(RepoError::RevisionConflict)}
    note.revision+=1; note.updated_at=Utc::now().to_rfc3339();
    let checklist=serde_json::to_string(&note.checklist)?;
    self.conn.execute("UPDATE notes SET title=?2,body=?3,kind=?4,checklist_json=?5,pinned=?6,deleted_at=?7,updated_at=?8,revision=?9 WHERE id=?1",
      params![note.id,note.title,note.body,note.kind,checklist,note.pinned as i64,note.deleted_at,note.updated_at,note.revision])?;
    Ok(note)
  }

  pub fn delete_forever(&self,id:&str)->Result<(),RepoError>{
    self.conn.execute("DELETE FROM notes WHERE id=?1 AND deleted_at IS NOT NULL",params![id])?; Ok(())
  }

  pub fn load_draft(&self)->Result<Option<Draft>,RepoError>{
    self.conn.query_row("SELECT id,title,body,updated_at FROM drafts WHERE id='capture'",[],|r|Ok(Draft{id:r.get(0)?,title:r.get(1)?,body:r.get(2)?,updated_at:r.get(3)?})).optional().map_err(Into::into)
  }

  pub fn save_draft(&self,input:DraftInput)->Result<Draft,RepoError>{
    let draft=Draft{id:"capture".into(),title:input.title,body:input.body,updated_at:Utc::now().to_rfc3339()};
    self.conn.execute("INSERT INTO drafts(id,title,body,updated_at) VALUES('capture',?1,?2,?3) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,updated_at=excluded.updated_at",
      params![draft.title,draft.body,draft.updated_at])?;
    Ok(draft)
  }

  pub fn clear_draft(&self)->Result<(),RepoError>{self.conn.execute("DELETE FROM drafts WHERE id='capture'",[])?;Ok(())}

  pub fn export_active_json(&self)->Result<String,RepoError>{
    serde_json::to_string_pretty(&self.list_notes("all","")?).map_err(Into::into)
  }
}

#[cfg(test)]
mod tests{
  use super::*;
  #[test]
  fn revision_conflict_is_rejected(){
    let repo=AppRepo::open(":memory:").unwrap();
    let note=repo.create_note(CreateNoteInput{title:"A".into(),body:"B".into()}).unwrap();
    let mut first=note.clone(); first.body="C".into();
    let saved=repo.update_note(first).unwrap();
    let mut stale=note; stale.body="D".into();
    assert!(matches!(repo.update_note(stale),Err(RepoError::RevisionConflict)));
    assert_eq!(saved.revision,2);
  }
}
