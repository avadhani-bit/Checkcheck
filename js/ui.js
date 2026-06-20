import { state } from "./state.js";
import { renderPage } from "./render.js";

export function goPage(page) {

    state.currentPage = page;

    document.querySelectorAll(".nav-item")
        .forEach(button => {

            button.classList.remove("active");

            if (button.dataset.page === page)
                button.classList.add("active");

        });

    renderPage();

}