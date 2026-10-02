mod repository;

use repository::{AppRepo, CreateNoteInput, DraftInput, Note};
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct RepoState(Mutex<AppRepo>);

#[tauri::command]
fn list_notes(state:State<RepoState>, filter:String, query:String)->Result<Vec<Note>,String>{
  state.0.lock().map_err(|_|"repository_lock".to_string())?.list_notes(&filter,&query).map_err(|e|e.to_string())
}

#[tauri::command]
fn create_note(state:State<RepoState>, input:CreateNoteInput)->Result<Note,String>{
  state.0.lock().map_err(|_|"repository_lock".to_string())?.create_note(input).map_err(|e|e.to_string())
}

#[tauri::command]
fn update_note(state:State<RepoState>, input:Note)->Result<Note,String>{
  state.0.lock().map_err(|_|"repository_lock".to_string())?.update_note(input).map_err(|e|e.to_string())
}

#[tauri::command]
fn delete_note_forever(state:State<RepoState>, id:String)->Result<(),String>{
  state.0.lock().map_err(|_|"repository_lock".to_string())?.delete_forever(&id).map_err(|e|e.to_string())
}

#[tauri::command]
fn load_capture_draft(state:State<RepoState>)->Result<Option<repository::Draft>,String>{
  state.0.lock().map_err(|_|"repository_lock".to_string())?.load_draft().map_err(|e|e.to_string())
}

#[tauri::command]
fn save_capture_draft(state:State<RepoState>, input:DraftInput)->Result<repository::Draft,String>{
  state.0.lock().map_err(|_|"repository_lock".to_string())?.save_draft(input).map_err(|e|e.to_string())
}

#[tauri::command]
fn clear_capture_draft(state:State<RepoState>)->Result<(),String>{
  state.0.lock().map_err(|_|"repository_lock".to_string())?.clear_draft().map_err(|e|e.to_string())
}

#[tauri::command]
fn export_notes_json(state:State<RepoState>)->Result<String,String>{
  state.0.lock().map_err(|_|"repository_lock".to_string())?.export_active_json().map_err(|e|e.to_string())
}

pub fn run(){
  tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app|{
      let db_dir=app.path().app_data_dir()?;
      std::fs::create_dir_all(&db_dir)?;
      let repo=AppRepo::open(db_dir.join("pip.sqlite"))?;
      app.manage(RepoState(Mutex::new(repo)));

      let shortcut=Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
      let handle=app.handle().clone();
      app.global_shortcut().on_shortcut(shortcut, move |_app,_shortcut,event|{
        if event.state()==ShortcutState::Pressed {
          if let Some(window)=handle.get_webview_window("main"){
            let _=window.show(); let _=window.set_focus();
            let _=window.eval("window.dispatchEvent(new KeyboardEvent('keydown',{ctrlKey:true,shiftKey:true,code:'Space'}))");
          }
        }
      })?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![list_notes,create_note,update_note,delete_note_forever,load_capture_draft,save_capture_draft,clear_capture_draft,export_notes_json])
    .run(tauri::generate_context!()).expect("error while running Pip");
}
