import { state } from "./state.js";

export function renderPage() {

    const container = document.getElementById("page-container");
    document.getElementById("page-title").innerText =
        state.currentPage.charAt(0).toUpperCase() +
        state.currentPage.slice(1);

    if (state.currentPage === "today") {

        container.innerHTML = `

        <div class="card">
            <h2 class="section-title">Good evening</h2>
            <p>3 tasks due today</p>
        </div>

        <div class="card">
            <h2 class="section-title">Work</h2>

            <div class="task">
                <div class="check"></div>
                <div class="task-name">Monthly Report</div>
            </div>

            <div class="task">
                <div class="check"></div>
                <div class="task-name">Website redesign</div>
            </div>

        </div>

        <div class="card">
            <h2 class="section-title">Personal</h2>

            <div class="task">
                <div class="check"></div>
                <div class="task-name">Call dentist</div>
            </div>

        </div>

        `;
    }

    if (state.currentPage === "work") {

        container.innerHTML = `

        <div class="card">

            <h2 class="section-title">Projects</h2>

            <div class="task">
                <div class="task-name">
                    Website redesign
                </div>
                8
            </div>

            <div class="task">
                <div class="task-name">
                    Client ABC
                </div>
                5
            </div>

            <div class="task">
                <div class="task-name">
                    Taxes
                </div>
                2
            </div>

        </div>
        `;
    }

    if (state.currentPage === "personal") {

        container.innerHTML = `

        <div class="card">

            <h2 class="section-title">Todos</h2>

            <div class="task">
                <div class="check"></div>
                <div class="task-name">
                    Dentist appointment
                </div>
            </div>

        </div>

        <div class="card">

            <h2 class="section-title">
                Shopping
            </h2>

            <div class="task">
                <div class="check"></div>
                <div class="task-name">
                    Eggs
                </div>
            </div>

            <div class="task">
                <div class="check"></div>
                <div class="task-name">
                    Milk
                </div>
            </div>

        </div>

        `;
    }

    if (state.currentPage === "reports") {

        container.innerHTML = `

        <div class="card">

            <h2 class="section-title">
                June 2026
            </h2>

            <p>
                18 completed tasks
            </p>

        </div>

        `;
    }

}