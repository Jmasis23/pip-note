import {describe,it,expect} from 'vitest';
import capture from './components/Capture.tsx?raw';
import native from '../src-tauri/src/lib.rs?raw';
import permissions from '../src-tauri/capabilities/default.json';
describe('capture resize guardrails',()=>{
 it('allows resize gestures but keeps a sane default',()=>{expect(native).toContain('.inner_size(440.0, 620.0)');expect(native).toContain('.resizable(true)');expect(permissions.permissions).toContain('core:window:allow-start-resize-dragging');expect(capture).toContain('startResizeDragging(direction)');});
 it('clamps when opening or moving/resizing',()=>{expect(native).toContain('fit_capture(&w, true)');expect(native).toContain('WindowEvent::Moved(_) | WindowEvent::Resized(_)');expect(native).toContain('monitor.work_area()');});
});
