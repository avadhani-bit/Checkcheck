import { renderPage } from "./render.js";
import { goPage } from "./ui.js";

renderPage();

document.querySelectorAll("[data-page]")
.forEach(button => {

    button.addEventListener("click", () => {

        goPage(button.dataset.page);

    });

});