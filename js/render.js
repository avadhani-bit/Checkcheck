import { state } from "./state.js";

export function renderPage(){

const container = document.getElementById("page-container");

if(state.currentPage==="today"){

container.innerHTML=`
<div class="card">

<h2 class="section-title">
Good evening
</h2>

Coming soon...

</div>
`;

}

}