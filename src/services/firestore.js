// services/firestore.js
import {
    auth, db,
    onSnapshot, doc, setDoc, updateDoc, addDoc, deleteDoc, collection,
    query, orderBy, serverTimestamp, getDocs
} from './firebaseConfig.js';

import { saveTasksLocally } from './localStorages.js';

// ----- Tasks -----
export async function addTask(task) {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    return addDoc(collection(db, 'users', u.uid, 'tasks'), {
        ...task,
        completed: false,
        createdAt: serverTimestamp()
    });
}

export function watchTasks(cb) {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    return onSnapshot(collection(db, 'users', u.uid, 'tasks'), (snap) => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

export function toggleTaskComplete(id, completed) {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    return updateDoc(doc(db, 'users', u.uid, 'tasks', id), { completed });
}

export function deleteTask(id) {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    return deleteDoc(doc(db, 'users', u.uid, 'tasks', id));
}

// ----- Events -----
export function watchEvents(cb) {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    return onSnapshot(query(collection(db, 'users', u.uid, 'events'), orderBy('start', 'asc')), (snap) => {
        cb(snap.docs.map(d => {
            const { start, end, title } = d.data();
            return {
                title: title || 'Event',
                start: start?.toDate ? start.toDate() : new Date(start),
                end: end?.toDate ? end.toDate() : new Date(end)
            };
        }));
    });
}

// ----- Study blocks -----
export function watchStudyBlocks(cb) {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    return onSnapshot(query(collection(db, 'users', u.uid, 'studyBlocks'), orderBy('start', 'asc')), (snap) => {
        cb(snap.docs.map(d => {
            const { start, end, title } = d.data();
            return {
                id: d.id,
                title: title || 'Study',
                start: start?.toDate ? start.toDate() : new Date(start),
                end: end?.toDate ? end.toDate() : new Date(end)
            };
        }));
    });
}

export async function addStudyBlockForWindow(dayLabel, start, end) {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    return addDoc(collection(db, 'users', u.uid, 'studyBlocks'), {
        title: 'Study',
        start,
        end,
        createdAt: serverTimestamp()
    });
}

export async function deleteStudyBlock(id) {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    return deleteDoc(doc(db, 'users', u.uid, 'studyBlocks', id));
}

// ----- User admin -----
export async function upsertUserMeta(user) {
    await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

export async function deleteAllUserData() {
    const u = auth.currentUser; if (!u) throw new Error('Not authed');
    const subs = ['tasks', 'events', 'weeks', 'studyBlocks', 'baseSchedule', 'meta'];
    for (const name of subs) {
        const colRef = collection(db, 'users', u.uid, name);
        const snap = await getDocs(colRef);
        const deletions = snap.docs.map(d => deleteDoc(doc(db, 'users', u.uid, name, d.id)));
        await Promise.all(deletions);
    }
    await deleteDoc(doc(db, 'users', u.uid));
}

// localStorage
watchTasks((tasks) => {
    state.tasks = tasks;
    renderTasks();
    saveTasksLocally(tasks); //
});