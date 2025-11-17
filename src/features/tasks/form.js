// features/tasks/form.js


// Importing the function that will actually save a task to Firestore
import { addTask } from '../../services/firestore.js';
// Import Bootstrap's Collapse class so that we are able to program the form
import { Collapse } from 'bootstrap';

export function attachTaskForm() {
    // Grabing the <form> element by its ID
    const form = document.getElementById('taskForm');

    // If the form doesn't exist on this page, do nothing and exit early
    if (!form) return;

    // Attach a "submit" event listener to the form
    form.addEventListener('submit', async (e) => {
        // Prevent the browser's default behaviour (page reload on submit)
        e.preventDefault();

        // Read the "Task / Assignment" name from the input
        // ?.value protects in case the element isn't found
        // .trim() removes leading/trailing spaces
        // Fallback to empty string if anything is missing
        const name = document.getElementById('taskName')?.value?.trim() || '';

        // Read the due date (a string in yyyy-mm-dd format from the input[type="date"])
        const dueDate = document.getElementById('dueDate')?.value || '';

        // Read the raw "Time needed (hrs)" field as a string
        const timeNeededRaw = document.getElementById('timeNeeded')?.value || '';

        // Convert the string to a floating-point number, so you can do math with it
        const timeNeeded = parseFloat(timeNeededRaw);

        // Read the "Importance" dropdown and convert it to an integer
        // Default to '3' (Medium) if the element isn't found or is empty
        const importance = parseInt(document.getElementById('importance')?.value || '3', 10);

        // Basic validation:
        // - name must not be empty
        // - dueDate must not be empty
        // - timeNeeded must be a valid number (not NaN)
        if (!name || !dueDate || Number.isNaN(timeNeeded)) return;

        // If validation passes, create the task in Firestore
        // addTask will handle attaching the user, storing it, etc
        await addTask({ name, dueDate, timeNeeded, importance });

        // Reset the form fields back to their initial empty state
        e.target.reset();

        // After submitting, collapse/hide the form (if using a Bootstrap Collapse wrapper)
        const collapse = document.getElementById('taskFormCollapse');

        // Get the existing Collapse instance or create one if it doesn't exist,
        // then programmatically hide it
        if (collapse) Collapse.getOrCreateInstance(collapse).hide();
    });
}