import { useEffect, useState } from "react";
import "./App.css";
import { auth, db } from "./firebase";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";

function App() {
  // Firebase Authentication
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Login and signup
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Firestore tasks
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskError, setTaskError] = useState("");

  // Task form
  const [taskName, setTaskName] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");

  // Search and filters
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  // Listen for login/logout
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      },
      (error) => {
        console.error("Authentication listener error:", error);
        setAuthLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // Load and listen to the current user's Firestore tasks
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setTasksLoading(false);
      setTaskError("");
      return;
    }

    let active = true;
    let unsubscribeTasks = () => {};

    const taskCollection = collection(
      db,
      "users",
      user.uid,
      "tasks"
    );

    async function loadTasks() {
      setTasksLoading(true);
      setTaskError("");

      try {
        const existingTasks = await getDocs(taskCollection);

        if (!active) return;

        // Migrate old browser tasks only if this user's
        // Firestore collection is empty.
        if (existingTasks.empty) {
          let oldTasks = [];

          try {
            oldTasks = JSON.parse(
              localStorage.getItem("studentTasks") || "[]"
            );

            if (!Array.isArray(oldTasks)) {
              oldTasks = [];
            }
          } catch {
            oldTasks = [];
          }

          if (oldTasks.length > 0) {
            await Promise.all(
              oldTasks.map((task, index) =>
                setDoc(
                  doc(taskCollection, `legacy_${index}`),
                  {
                    name: task.name || task.title || "Untitled task",
                    priority: ["High", "Medium", "Low"].includes(
                      task.priority
                    )
                      ? task.priority
                      : "Medium",
                    dueDate: task.dueDate || "",
                    completed: Boolean(task.completed),
                    ownerUid: user.uid,
                  }
                )
              )
            );

            // Remove the old browser copy after successful migration.
            localStorage.removeItem("studentTasks");
          }
        }

        if (!active) return;

        // Keep the dashboard updated when Firestore changes.
        unsubscribeTasks = onSnapshot(
          taskCollection,
          (snapshot) => {
            if (!active) return;

            const loadedTasks = snapshot.docs.map(
              (taskDocument) => {
                const data = taskDocument.data();

                return {
                  id: taskDocument.id,
                  name: data.name || data.title || "",
                  priority: data.priority || "Medium",
                  dueDate: data.dueDate || "",
                  completed: Boolean(data.completed),
                };
              }
            );

            setTasks(loadedTasks);
            setTasksLoading(false);
            setTaskError("");
          },
          (error) => {
            console.error("Firestore listener error:", error);

            if (active) {
              setTaskError(
                "Could not load tasks. Check your Firestore Rules and internet connection."
              );
              setTasksLoading(false);
            }
          }
        );
      } catch (error) {
        console.error("Loading tasks error:", error);

        if (active) {
          setTaskError(
            "Could not connect to Firestore. Check your database rules and internet connection."
          );
          setTasksLoading(false);
        }
      }
    }

    loadTasks();

    return () => {
      active = false;
      unsubscribeTasks();
    };
  }, [user]);

  // Login or create an account
  async function handleAuth(e) {
    e.preventDefault();

    if (authSubmitting) return;

    setAuthSubmitting(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        alert("Login successful!");
      } else {
        await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        alert("Account created successfully!");
      }

      setEmail("");
      setPassword("");
    } catch (error) {
      console.error("Authentication error:", error);

      const messages = {
        "auth/invalid-credential":
          "Incorrect email or password. Please check and try again.",
        "auth/email-already-in-use":
          "This email already has an account. Please log in.",
        "auth/weak-password":
          "Please use a stronger password with at least 6 characters.",
        "auth/invalid-email":
          "Please enter a valid email address.",
        "auth/operation-not-allowed":
          "Enable Email/Password in Firebase Authentication.",
        "auth/network-request-failed":
          "Network error. Check your internet connection.",
        "auth/too-many-requests":
          "Too many attempts. Please try again later.",
      };

      alert(
        messages[error.code] ||
          `Authentication failed: ${error.message}`
      );
    } finally {
      setAuthSubmitting(false);
    }
  }

  // Logout
  async function handleLogout() {
    try {
      await signOut(auth);
      setTaskName("");
      setSearch("");
      setFilter("All");
      alert("Logged out successfully!");
    } catch (error) {
      console.error("Logout error:", error);
      alert(`Logout failed: ${error.message}`);
    }
  }

  // Add a task to the logged-in user's collection
  async function addTask(e) {
    e.preventDefault();

    if (!taskName.trim()) {
      alert("Please enter a task name.");
      return;
    }

    if (!user) return;

    try {
      await addDoc(
        collection(db, "users", user.uid, "tasks"),
        {
          name: taskName.trim(),
          priority,
          dueDate,
          completed: false,
          ownerUid: user.uid,
        }
      );

      setTaskName("");
      setPriority("Medium");
      setDueDate("");
      setTaskError("");
    } catch (error) {
      console.error("Add task error:", error);
      setTaskError(
        `Could not add task: ${error.message}`
      );
    }
  }

  // Complete or uncomplete a task
  async function toggleTask(id) {
    if (!user) return;

    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    try {
      await updateDoc(
        doc(db, "users", user.uid, "tasks", id),
        { completed: !task.completed }
      );

      setTaskError("");
    } catch (error) {
      console.error("Update task error:", error);
      setTaskError(
        `Could not update task: ${error.message}`
      );
    }
  }

  // Delete a task
  async function deleteTask(id) {
    if (!user) return;

    try {
      await deleteDoc(
        doc(db, "users", user.uid, "tasks", id)
      );

      setTaskError("");
    } catch (error) {
      console.error("Delete task error:", error);
      setTaskError(
        `Could not delete task: ${error.message}`
      );
    }
  }

  // Dashboard statistics
  const totalTasks = tasks.length;

  const completedTasks = tasks.filter(
    (task) => task.completed
  ).length;

  const pendingTasks = totalTasks - completedTasks;

  const completionPercentage =
    totalTasks === 0
      ? 0
      : Math.round((completedTasks / totalTasks) * 100);

  // Search and filters
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = (task.name || "")
      .toLowerCase()
      .includes(search.trim().toLowerCase());

    let matchesFilter = true;

    if (filter === "Pending") {
      matchesFilter = !task.completed;
    } else if (filter === "Completed") {
      matchesFilter = task.completed;
    } else if (filter === "High Priority") {
      matchesFilter = (task.priority || "Medium") === "High";
    }

    return matchesSearch && matchesFilter;
  });

  // Due date status
  function getDateStatus(task) {
    if (!task.dueDate || task.completed) return "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deadline = new Date(`${task.dueDate}T00:00:00`);

    if (Number.isNaN(deadline.getTime())) return "";
    if (deadline < today) return "Overdue";

    if (deadline.getTime() === today.getTime()) {
      return "Due today";
    }

    return "";
  }

  // Authentication loading
  if (authLoading) {
    return <p>Checking login...</p>;
  }

  // Login/signup page
  if (!user) {
    return (
      <div className="auth-container">
        <form className="auth-card" onSubmit={handleAuth}>
          <h1>Smart Student Planner</h1>
          <p>Plan your day. Achieve your goals.</p>

          <h2>{isLogin ? "Login" : "Create Account"}</h2>

          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <input
            type="password"
            placeholder="Enter password (minimum 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            autoComplete={
              isLogin ? "current-password" : "new-password"
            }
            required
          />

          <button type="submit" disabled={authSubmitting}>
            {authSubmitting
              ? "Please wait..."
              : isLogin
                ? "Login"
                : "Sign Up"}
          </button>

          <p>
            {isLogin
              ? "Don't have an account?"
              : "Already have an account?"}
          </p>

          <button
            type="button"
            onClick={() => setIsLogin((current) => !current)}
            disabled={authSubmitting}
          >
            {isLogin ? "Create Account" : "Login"}
          </button>
        </form>
      </div>
    );
  }

  // Main planner dashboard
  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="subtitle">STUDENT PRODUCTIVITY</p>
          <h1>Smart Student Planner</h1>
          <p>Plan your day. Achieve your goals.</p>
          <p>Logged in as: {user.email}</p>

          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="stats">
          <h2>{completionPercentage}%</h2>
          <p>Completion rate</p>
        </div>
      </header>

      {/* Dashboard statistics */}
      <section className="stats-grid">
        <div className="stat-card">
          <p>Total Tasks</p>
          <h2>{totalTasks}</h2>
        </div>

        <div className="stat-card completed-stat">
          <p>Completed</p>
          <h2>{completedTasks}</h2>
        </div>

        <div className="stat-card pending-stat">
          <p>Pending</p>
          <h2>{pendingTasks}</h2>
        </div>

        <div className="stat-card progress-stat">
          <p>Progress</p>
          <h2>{completionPercentage}%</h2>
        </div>
      </section>

      {/* Progress bar */}
      <section className="card progress-card">
        <div className="progress-heading">
          <h2>Overall Progress</h2>
          <span>
            {completedTasks} of {totalTasks} completed
          </span>
        </div>

        <div
          className="progress-track"
          role="progressbar"
          aria-label="Overall task completion"
          aria-valuenow={completionPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="progress-fill"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </section>

      {/* Add task */}
      <section className="card">
        <h2>+ Add a New Task</h2>

        <form onSubmit={addTask}>
          <input
            type="text"
            placeholder="Enter your task..."
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            required
          />

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            aria-label="Task priority"
          >
            <option value="High">High Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="Low">Low Priority</option>
          </select>

          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Task due date"
          />

          <button type="submit">Add Task</button>
        </form>
      </section>

      {/* Search and filters */}
      <section className="card">
        <h2>Find Your Tasks</h2>

        <input
          className="search-input"
          type="search"
          placeholder="Search tasks by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="filter-buttons">
          {["All", "Pending", "Completed", "High Priority"].map(
            (option) => (
              <button
                key={option}
                type="button"
                className={
                  filter === option
                    ? "filter-button active-filter"
                    : "filter-button"
                }
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            )
          )}
        </div>

        <p className="results-count">
          Showing {filteredTasks.length} of {totalTasks} tasks
        </p>
      </section>

      {/* Task list */}
      <section className="card">
        <h2>My Tasks</h2>

        {taskError && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {taskError}
          </p>
        )}

        {tasksLoading ? (
          <p className="empty">Loading your tasks...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="empty">
            {totalTasks === 0
              ? "No tasks yet. Add your first task!"
              : "No matching tasks found. Try another search or filter."}
          </p>
        ) : (
          filteredTasks.map((task) => {
            const dateStatus = getDateStatus(task);
            const taskPriority = task.priority || "Medium";

            return (
              <div className="task" key={task.id}>
                <label className="task-label">
                  <input
                    type="checkbox"
                    checked={Boolean(task.completed)}
                    onChange={() => toggleTask(task.id)}
                  />

                  <span className={task.completed ? "done" : ""}>
                    {task.name}
                  </span>
                </label>

                <div className="task-details">
                  <span
                    className={`priority ${taskPriority.toLowerCase()}`}
                  >
                    {taskPriority}
                  </span>

                  {task.dueDate && (
                    <span className="due-date">
                      Due: {task.dueDate}
                    </span>
                  )}

                  {dateStatus && (
                    <span className="date-status">
                      {dateStatus}
                    </span>
                  )}

                  <button
                    type="button"
                    className="delete"
                    onClick={() => deleteTask(task.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <footer>Made for better study habits.</footer>
    </div>
  );
}

export default App;