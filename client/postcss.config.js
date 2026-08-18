import { fileURLToPath } from "url";
import path from "path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [
    tailwindcss(path.join(__dirname, "tailwind.config.js")),
    autoprefixer(),
  ],
};