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
import { arrayUnion, arrayRemove } from "firebase/firestore";

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
  if (!u) throw new Error('Not authed');
  return addDoc(collection(db, 'users', u.uid, 'tasks'), {
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

/* ------------------- BASE SCHEDULE ------------------- */
/** Pattern is a single doc: users/{uid}/baseSchedule/pattern */
export function watchBasePattern(cb) {
  const u = auth.currentUser;
  if (!u) throw new Error('Not authed');
  const ref = doc(db, 'users', u.uid, 'baseSchedule', 'pattern');
  return onSnapshot(ref, (snap) => {
    const data = snap.data() || {};
    cb(Array.isArray(data.pattern) ? data.pattern : []);
  });
}

export async function saveBasePattern(pattern) {
  const u = auth.currentUser;
  if (!u) throw new Error('Not authed');
  const ref = doc(db, 'users', u.uid, 'baseSchedule', 'pattern');
  await setDoc(ref, {
    pattern: (pattern || []).map(p => ({ weekday: p.weekday, hour: p.hour })),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

/**
 * Exclusions are docs by week:
 *   users/{uid}/baseScheduleExclusions/{weekId}
 *   where doc.slots = [slotKey (Number millis), ...]
 */
export function watchBaseExclusions(weekId, cb) {
  const u = auth.currentUser;
  if (!u) throw new Error('Not authed');
  const ref = doc(db, 'users', u.uid, 'baseScheduleExclusions', weekId);
  return onSnapshot(ref, (snap) => {
    const data = snap.data() || {};
    const slots = Array.isArray(data.slots) ? data.slots : [];
    // Replace the Set entirely; coerce to numbers
    cb(new Set(slots.map(Number)));
  });
}

export async function toggleBaseExclusion(weekId, slotKey, shouldExclude) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authed");

  const ref = doc(db, "users", u.uid, "baseScheduleExclusions", weekId);
  const keyNum = Number(slotKey);

  console.log("[FIRESTORE] toggleBaseExclusion", {
    weekId,
    slotKey: keyNum,
    shouldExclude,
  });

  // Single write; create doc if missing; transform the array without clearing it
  await setDoc(
    ref,
    { slots: shouldExclude ? arrayUnion(keyNum) : arrayRemove(keyNum) },
    { merge: true }
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
  if (!u) throw new Error('Not authed');
  const subs = ['tasks', 'weeks', 'studyBlocks', 'baseSchedule', 'meta'];
  for (const name of subs) {
    const colRef = collection(db, 'users', u.uid, name);
    const snap = await getDocs(colRef);
    const deletions = snap.docs.map(d => deleteDoc(doc(db, 'users', u.uid, name, d.id)));
    await Promise.all(deletions);
  }
  await deleteDoc(doc(db, 'users', u.uid));
}

