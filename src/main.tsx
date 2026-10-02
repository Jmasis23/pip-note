import { createRoot } from "react-dom/client";
import { seedIfAsked } from "./seed";
import "./styles.css";
import Desk from "./dirs/DirB";
seedIfAsked();
createRoot(document.getElementById("root")!).render(<Desk />);
