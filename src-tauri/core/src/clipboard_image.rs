//! Bounded Windows DIB/PNG conversion. No files, URLs or network access.
use std::io::Cursor;
pub const MAX_PIXELS: usize = 8_000_000;
fn u16le(b: &[u8], o: usize) -> Option<u16> { Some(u16::from_le_bytes(b.get(o..o+2)?.try_into().ok()?)) }
fn u32le(b: &[u8], o: usize) -> Option<u32> { Some(u32::from_le_bytes(b.get(o..o+4)?.try_into().ok()?)) }
fn encode(w: u32, h: u32, rgba: &[u8]) -> Result<Vec<u8>,String> {
    let mut out=Vec::new(); { let mut enc=png::Encoder::new(&mut out,w,h); enc.set_color(png::ColorType::Rgba); enc.set_depth(png::BitDepth::Eight); enc.write_header().map_err(|e|e.to_string())?.write_image_data(rgba).map_err(|e|e.to_string())?; } Ok(out)
}
pub fn decode_png(bytes:&[u8]) -> Result<(u32,u32,Vec<u8>),String> {
    if bytes.len()>crate::clipboard::MAX_IMAGE_BYTES { return Err("Image exceeds 4 MB".into()); }
    let mut dec=png::Decoder::new(Cursor::new(bytes)); dec.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader=dec.read_info().map_err(|e|e.to_string())?; let info=reader.info();
    if (info.width as usize).checked_mul(info.height as usize).filter(|p|*p<=MAX_PIXELS).is_none() || reader.output_buffer_size()>MAX_PIXELS*4 { return Err("Image exceeds 8 megapixels".into()); }
    let mut buf=vec![0;reader.output_buffer_size()]; let info=reader.next_frame(&mut buf).map_err(|e|e.to_string())?;
    let mut rgba=Vec::with_capacity(info.width as usize*info.height as usize*4);
    match info.color_type {
        png::ColorType::Rgba => rgba.extend_from_slice(&buf[..info.buffer_size()]),
        png::ColorType::Rgb => for p in buf[..info.buffer_size()].chunks_exact(3) { rgba.extend_from_slice(&[p[0],p[1],p[2],255]); },
        png::ColorType::Grayscale => for p in &buf[..info.buffer_size()] { rgba.extend_from_slice(&[*p,*p,*p,255]); },
        png::ColorType::GrayscaleAlpha => for p in buf[..info.buffer_size()].chunks_exact(2) { rgba.extend_from_slice(&[p[0],p[0],p[0],p[1]]); },
        _ => return Err("Unsupported PNG".into())
    } Ok((info.width,info.height,rgba))
}
pub fn normalize_png(bytes:&[u8]) -> Result<Vec<u8>,String> { let (w,h,rgba)=decode_png(bytes)?; let png=encode(w,h,&rgba)?; if png.len()>crate::clipboard::MAX_IMAGE_BYTES { return Err("Image exceeds 4 MB".into()); } Ok(png) }
pub fn dib_to_png(b:&[u8]) -> Result<Vec<u8>,String> {
    let bad=||"Unsupported clipboard bitmap".to_string(); let header=u32le(b,0).ok_or_else(bad)? as usize;
    if ![40,52,56,108,124].contains(&header) || b.len()<header { return Err(bad()); }
    let w=u32le(b,4).ok_or_else(bad)? as i32; let signed_h=u32le(b,8).ok_or_else(bad)? as i32;
    let h=signed_h.checked_abs().ok_or_else(bad)? as usize; let bits=u16le(b,14).ok_or_else(bad)? as usize; let comp=u32le(b,16).ok_or_else(bad)?;
    if w<=0 || h==0 || u16le(b,12)!=Some(1) || ![24,32].contains(&bits) || ![0,3].contains(&comp) || (comp==3 && bits!=32) || (w as usize).checked_mul(h).filter(|n|*n<=MAX_PIXELS).is_none() { return Err(bad()); }
    let w=w as usize; let stride=(w*bits).div_ceil(32)*4;
    let mut offset=header; let mut masks=[0xff0000,0xff00,0xff,0];
    if comp==3 { masks[0]=u32le(b,40).ok_or_else(bad)?; masks[1]=u32le(b,44).ok_or_else(bad)?; masks[2]=u32le(b,48).ok_or_else(bad)?; if header>=56 { masks[3]=u32le(b,52).ok_or_else(bad)?; } else if header==40 { offset+=12; }
        if masks[..3].contains(&0) { return Err(bad()); }
    }
    // Color table entries are unusual with 24/32-bit DIB but allowed.
    offset=offset.checked_add((u32le(b,32).ok_or_else(bad)? as usize).checked_mul(4).ok_or_else(bad)?).ok_or_else(bad)?;
    let data=b.get(offset..offset.checked_add(stride*h).ok_or_else(bad)?).ok_or_else(bad)?;
    let channel=|v:u32,m:u32| -> u8 { if m==0 {255} else {let shifted=m>>m.trailing_zeros(); (((v&m)>>m.trailing_zeros()) as u64*255/shifted as u64) as u8} };
    let mut rgba=vec![0;w*h*4];
    for y in 0..h { let row=if signed_h<0 {y} else {h-1-y}; for x in 0..w {
        let p=&data[row*stride+x*(bits/8)..]; let dst=&mut rgba[(y*w+x)*4..][..4];
        if comp==3 && bits==32 { let v=u32::from_le_bytes(p[..4].try_into().unwrap()); dst.copy_from_slice(&[channel(v,masks[0]),channel(v,masks[1]),channel(v,masks[2]),channel(v,masks[3])]); }
        else { dst.copy_from_slice(&[p[2],p[1],p[0],255]); }
    } }
    let out=encode(w as u32,h as u32,&rgba)?; if out.len()>crate::clipboard::MAX_IMAGE_BYTES { return Err("Image exceeds 4 MB".into()); } Ok(out)
}
pub fn png_to_dib(bytes:&[u8]) -> Result<Vec<u8>,String> {
    let (w,h,rgba)=decode_png(bytes)?; let mut out=vec![0;124+rgba.len()];
    for (o,v) in [(0,124),(4,w),(8,(-(h as i32)) as u32),(16,3),(20,rgba.len() as u32),(40,0xff0000),(44,0xff00),(48,0xff),(52,0xff000000),(56,0x73524742)] { out[o..o+4].copy_from_slice(&v.to_le_bytes()); }
    out[12..14].copy_from_slice(&1u16.to_le_bytes()); out[14..16].copy_from_slice(&32u16.to_le_bytes());
    for (src,dst) in rgba.chunks_exact(4).zip(out[124..].chunks_exact_mut(4)) { dst.copy_from_slice(&[src[2],src[1],src[0],src[3]]); } Ok(out)
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn transparent_png_dib_roundtrip() { let png=encode(2,1,&[255,0,0,255,0,128,255,90]).unwrap(); let dib=png_to_dib(&png).unwrap(); let png=dib_to_png(&dib).unwrap(); assert_eq!(decode_png(&png).unwrap(),(2,1,vec![255,0,0,255,0,128,255,90])); }
    #[test] fn bottom_up_24bit_padding() { let mut b=vec![0;48]; b[..4].copy_from_slice(&40u32.to_le_bytes()); b[4..8].copy_from_slice(&1u32.to_le_bytes()); b[8..12].copy_from_slice(&2u32.to_le_bytes()); b[12]=1; b[14]=24; b[40..48].copy_from_slice(&[255,0,0,0,0,0,255,0]); let png=dib_to_png(&b).unwrap(); assert_eq!(decode_png(&png).unwrap().2,vec![255,0,0,255,0,0,255,255]); }
    #[test] fn rejects_short_huge_and_invalid_images() { assert!(dib_to_png(&[0;20]).is_err()); let mut b=vec![0;40]; b[0]=40; b[4..8].copy_from_slice(&100_000u32.to_le_bytes()); b[8..12].copy_from_slice(&100_000u32.to_le_bytes()); b[12]=1;b[14]=32;assert!(dib_to_png(&b).is_err()); assert!(decode_png(&[1,2,3]).is_err()); }
}
