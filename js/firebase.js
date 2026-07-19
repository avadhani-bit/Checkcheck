firebase.initializeApp({
  apiKey: "AIzaSyBpUUVpBIsuKAx1Tw-cnN4ItXho7IqbMMQ",
  authDomain: "checkcheck-3d35f.firebaseapp.com",
  projectId: "checkcheck-3d35f",
  storageBucket: "checkcheck-3d35f.firebasestorage.app",
  messagingSenderId: "744363444071",
  appId: "1:744363444071:web:5e72bf03a2771ae83c91c2"
});

export const auth = firebase.auth();
export const db   = firebase.firestore();

export async function loadUserData(uid) {
  const base = db.collection("users").doc(uid);

  const [projects, tasks, todos, shopping, chores] = await Promise.all([
    base.collection("projects").get(),
    base.collection("tasks").get(),
    base.collection("todos").get(),
    base.collection("shopping").get(),
    base.collection("chores").get()
  ]);

  return {
    projects: projects.docs.map(d => ({ id: d.id, ...d.data() })),
    tasks:    tasks.docs.map(d => ({ id: d.id, ...d.data() })),
    todos:    todos.docs.map(d => ({ id: d.id, ...d.data() })),
    shopping: shopping.docs.map(d => ({ id: d.id, ...d.data() })),
    chores:   chores.docs.map(d => ({ id: d.id, ...d.data() }))
  };
}
