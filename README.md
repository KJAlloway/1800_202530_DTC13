# STACK

## Overview

STACK is a client-side JavaScript web application that helps users manage their time in accordance with assignments and tasks. This app allows the user to set their study schedule and create tasks with attributes like a tittle, a due date, the time required to complete, and importance level.

Developed for the COMP 1800 course, this project applies User-Centred Design practices, agile project management, and demonstrates integration with Firebase backend services for storing user tasks and study schedule.

---

## Features

- Set a base weekly and/or unique schedule
- Create task cards, and sort them by due date, time required, or priority
- Complete or delete task cards
- Responsive design for desktop and mobile

---

## Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Backend**: Firebase for hosting
- **Database**: Firestore

---

## Usage

To run the application locally:

1.  **Clone** the repository.
2.  **Install dependencies** by running `npm install` in the project root directory.
3.  **Start the development server** by running the command: `npm run dev`.
4.  Open your browser and visit the local address shown in your terminal (usually `http://localhost:5173` or similar).

Once the application is running:

1.  Set your base study schedule in the Schedule Page
2.  Add tasks to your Tasks page
3.  Sort your tasks based on Due Date, time required to complete, or by priority as a default

---

## Project Structure

```
1800_202530_DTC13/
├── src/
│   ├── auth/
│   │   ├── flows.js
│   │   ├── pretty.js
│   │   ├── ui.js
│   ├── calendar/
│   │   ├── constants.js
│   │   ├── grid.js
│   │   ├── helpers.js
│   │   ├── modal.js
│   │   ├── range.js
│   ├── features/
│   │   ├── tasks/
│   │   │   ├── form.js
│   │   │   ├── render.js.js
│   ├── services/
│   │   ├── firebaseConfig.js
│   │   ├── firestore.js
│   │   ├── localStorage.js
│   ├── app.js
│   ├── main.js
│   ├── priority.js
│   ├── state.js
│   ├── style.scss
│   ├── time.js
├── styles/
│   ├── bell.svg
│   ├── brand_stackoverflow.svg
│   ├── calendar-month.svg
│   ├── home.svg
│   ├── note.svg
│   ├── settings.svg
├── .env.local
├── .gitignore
├── index.html
├── package-lock.json
├── package.json
├── README.md



```

---

## Contributors

- **Andrew Solomko** - BCIT CST Student with a passion for outdoor adventures and user-friendly applications. Fun fact: Loves solving Rubik's Cubes in under a minute.
- **Kelsen Alloway** - BCIT CST Student, Frontend enthusiast with a knack for creative design. Fun fact: Has a collection of over 50 houseplants.
- **Donovan Larkin Newcombe** - BCIT CST Student, Frontend enthusiast with a knack for creative design. Fun fact: Has a collection of over 50 houseplants.

---

## Acknowledgments

- Icons sourced from [tabler icons](https://tabler.io/icons)
- Code snippets were adapted from resources such as [Bootstrap](getbootstrap.com) and [ChatGPT5](chatgtp.com).

---

## Limitations and Future Work

### Limitations

- No current support for reminders
- Task due date set to end of the day

### Future Work

- Implement reminders functionality
- Add optional ability to set time of day as a part of the due date
- Add dark mode functionality

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.
