import { createRoot } from "react-dom/client";
import { migrate } from "./companion/storage";
import App from "./companion/App";
import "./companion/pip.css";
async function boot() {
  try {
    await migrate();
    createRoot(document.getElementById("root")!).render(<App />);
  } catch (e) {
    createRoot(document.getElementById("root")!).render(
      <main className="startup-error">
        <h1>Pip couldn't load your library</h1>
        <p role="alert">{String(e)}</p>
        <p>Your original data was preserved.</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>,
    );
  }
}
void boot();
