import { state } from "./state.js";
import { renderPage } from "./render.js";

export function goPage(page){

state.currentPage = page;

renderPage();

}