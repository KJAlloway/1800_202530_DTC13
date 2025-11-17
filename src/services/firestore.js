// services/firestore.js

/** Imports
 * auth is for reading auth.currentUser
 * db is the Firestore database instance
 * The rest are Firestore helper functions
 */
import {
  auth,
  db,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
} from "./firebaseConfig.js";

//Imports helper for saving tasks to local storage
import { saveTasksLocally } from "./localStorages.js";

// Tasks
/** Add a task

 * Reads the currently logged in user
 * if there is no user, prevents database access
 * collection(...) points to the Firestore subcollection for tasks
 * addDoc() creates a new task in Firestore with all fields included in task, completed,
 * which is set to false, and createdAt, set to Firestores server timestamp sentinel 
 */
export async function addTask(task) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  return addDoc(collection(db, "users", u.uid, "tasks"), {
    ...task,
    completed: false,
    createdAt: serverTimestamp(),
  });
}

/** Real time task listener
 * Reads the currently logged in user
 * if there is no user, prevents database access
 * onSnapshot sets up a real time listener.
 * collection(...) points to the Firestore subcollection for tasks
 * Firestore calls the callback function every time tasks change
 * snap.docs creates an array of DocumentSnapshot objects
 * .map transforms each document snapshot into our own objects
 * id: d.id ensures each Firestore document has its unique id, that's not stored inside the document data.
 * d.data() return an object containing all fields stored in Firestore.
 * ...d.data() expands the returned fields into an object
 * snap.docs.map() ends up an array of js objects
 * cb() is a function our UI passes in when calling real time listeners like watchTasks and watchEvents
 */
export function watchTasks(cb) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  return onSnapshot(collection(db, "users", u.uid, "tasks"), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

/** Toggle for task complete
 * Reads the currently logged in user.
 * if there is no user, prevents database access.
 * updates the completed field for a task
 */
export async function toggleTaskComplete(id, completed) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  return updateDoc(doc(db, "users", u.uid, "tasks", id), { completed });
}

/** Delete a task
 * Reads the currently logged in user.
 * if there is no user, prevents database access.
 * Deletes document at the specified path with passed in id
 */
export async function deleteTask(id) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  return deleteDoc(doc(db, "users", u.uid, "tasks", id));
}

// Events
/** Real time watcher for events
 * Reads the currently logged in user.
 * if there is no user, prevents database access.
 * sets up a real time listener using onSnapshot.
 * creates a Firestore query which is an object that represents instructions
 * for Firestore about what documents you want and in what order.
 * orders the documents from the query by the start field, and in ascending order.
 * together the query object is not data, but a description for Firestore of how
 * to retrive that data. This is done in order to retrieve the documents in order.
 * maps each event doc into a title (default: "Event"), and a start and end timestamps
 * converted to js Date objects.
 * start?.toDate means if start exists and has a property called toDate, return that property
 * if not return undefined instead of an error, this prevents crashes.
 * If the time comes from Firestore in the form of a Firestore Timestamp, then
 * start.toDate() will work, if the time is just a number (js date or milliseconds since epoch),
 * then it creates a new js date.
 * Needed because Firestone can return things inconsistently
 */
export function watchEvents(cb) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  return onSnapshot(
    query(collection(db, "users", u.uid, "events"), orderBy("start", "asc")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const { start, end, title } = d.data();
          return {
            title: title || "Event",
            start: start?.toDate ? start.toDate() : new Date(start),
            end: end?.toDate ? end.toDate() : new Date(end),
          };
        })
      )
  );
}

// Study Blocks
/**
 * Identical to watchEvents except,
 * collection is studyBlocks
 * returned objects also include Firestore doc ID
 *
 *
 */
export function watchStudyBlocks(cb) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  return onSnapshot(
    query(
      collection(db, "users", u.uid, "studyBlocks"),
      orderBy("start", "asc")
    ),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const { start, end, title } = d.data();
          return {
            id: d.id,
            title: title || "Study",
            start: start?.toDate ? start.toDate() : new Date(start),
            end: end?.toDate ? end.toDate() : new Date(end),
          };
        })
      )
  );
}

/** Add study block
 * Checks to see if a user is logged in
 * Adds a document to the study blocks collection with:
 * the title "Study"
 * a start and end timestamp
 * and the Firestore serverTimestamp
 */
export async function addStudyBlockForWindow(dayLabel, start, end) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  return addDoc(collection(db, "users", u.uid, "studyBlocks"), {
    title: "Study",
    start,
    end,
    createdAt: serverTimestamp(),
  });
}

/** Delete a study block
 * Checks to see if a user is logged in
 * deletes document with provided id from study blocks collection
 */
export async function deleteStudyBlock(id) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  return deleteDoc(doc(db, "users", u.uid, "studyBlocks", id));
}

// User
/** Upsert user meta
 * Writes user info to Firestore:
 * email
 * timezone
 * Firestore serverTimestamp
 * merge allows you to update the specified fields (email, tz, and updatedAt)
 * without overwriting the whole document
 */
export async function upsertUserMeta(user) {
  await setDoc(
    doc(db, "users", user.uid),
    {
      email: user.email,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Delete all user data
 * Checks to see if a user is logged in
 * Defines names of subcollections to delete in subs array
 * for each name in subs array:
 * reads all documents(getDocs)
 * Build delete promises for each doc
 * Executes all deletions at the same time using Promise.all
 *
 * Finally, deletes the root user document
 */
export async function deleteAllUserData() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");
  const subs = [
    "tasks",
    "events",
    "weeks",
    "studyBlocks",
    "baseSchedule",
    "meta",
  ];
  for (const name of subs) {
    const colRef = collection(db, "users", u.uid, name);
    const snap = await getDocs(colRef);
    const deletions = snap.docs.map((d) =>
      deleteDoc(doc(db, "users", u.uid, name, d.id))
    );
    await Promise.all(deletions);
  }
  await deleteDoc(doc(db, "users", u.uid));
}
