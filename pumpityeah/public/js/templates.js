// Template gallery definitions. Blocks are built fresh each time so ids are unique.
import { uid } from './common.js';

const b = (type, html = '', extra = {}) => ({ id: uid(), type, html, ...extra });
const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export const TEMPLATES = [
  {
    id: 'meeting', name: 'Meeting notes', icon: '🗓️', category: 'Work', desc: 'Agenda, notes, decisions and action items.',
    build: () => ({
      title: `Meeting — ${today()}`, icon: '🗓️',
      blocks: [
        b('callout', 'Attendees: ', { icon: '👥' }),
        b('h2', 'Agenda'), b('numbered', ''), b('numbered', ''),
        b('h2', 'Notes'), b('bullet', ''),
        b('h2', 'Decisions'), b('bullet', ''),
        b('h2', 'Action items'), b('todo', ''),
      ],
    }),
  },
  {
    id: 'tasks', name: 'Task tracker', icon: '✅', category: 'Work', desc: 'A table database with status, owner and due dates.',
    build: () => ({
      title: 'Tasks', icon: '✅', kind: 'database', view: 'table',
      schema: [
        { id: 'status', name: 'Status', type: 'status', options: [{ name: 'Not started', color: 'gray' }, { name: 'In progress', color: 'blue' }, { name: 'Done', color: 'green' }] },
        { id: 'owner', name: 'Owner', type: 'person' },
        { id: 'due', name: 'Due', type: 'date' },
        { id: 'priority', name: 'Priority', type: 'select', options: [{ name: 'High', color: 'red' }, { name: 'Medium', color: 'yellow' }, { name: 'Low', color: 'gray' }] },
      ],
      rows: [
        { title: 'Write project kickoff doc', props: { status: 'In progress', due: iso(2), priority: 'High' } },
        { title: 'Set up weekly check-in', props: { status: 'Not started', due: iso(5), priority: 'Medium' } },
        { title: 'Collect feedback from stakeholders', props: { status: 'Not started', due: iso(9), priority: 'Low' } },
      ],
    }),
  },
  {
    id: 'reading', name: 'Reading list', icon: '📖', category: 'Personal', desc: 'Track books and articles on a board.',
    build: () => ({
      title: 'Reading list', icon: '📖', kind: 'database', view: 'board',
      schema: [
        { id: 'status', name: 'Status', type: 'status', options: [{ name: 'To read', color: 'gray' }, { name: 'Reading', color: 'yellow' }, { name: 'Finished', color: 'green' }] },
        { id: 'author', name: 'Author', type: 'text' },
        { id: 'type', name: 'Type', type: 'select', options: [{ name: 'Book', color: 'brown' }, { name: 'Article', color: 'blue' }] },
      ],
      rows: [
        { title: 'Atomic Habits', props: { status: 'To read', author: 'James Clear', type: 'Book' } },
        { title: 'Deep Work', props: { status: 'Reading', author: 'Cal Newport', type: 'Book' } },
      ],
    }),
  },
  {
    id: 'brief', name: 'Product brief', icon: '📄', category: 'Work', desc: 'Problem, goals, scope and success metrics.',
    build: () => ({
      title: 'Product brief', icon: '📄',
      blocks: [
        b('callout', 'Status: Draft · Owner: you · Last updated: ' + today(), { icon: '📌' }),
        b('h2', 'Problem'), b('p', 'What problem are we solving, and for whom?'),
        b('h2', 'Goals'), b('bullet', ''),
        b('h2', 'Non-goals'), b('bullet', ''),
        b('h2', 'Proposed solution'), b('p', ''),
        b('h2', 'Success metrics'), b('bullet', ''),
        b('h2', 'Open questions'), b('todo', ''),
      ],
    }),
  },
  {
    id: 'weekly', name: 'Weekly planner', icon: '📅', category: 'Personal', desc: 'Plan your week day by day.',
    build: () => ({
      title: 'This week', icon: '📅',
      blocks: [
        b('h2', 'Top 3 priorities'), b('numbered', ''), b('numbered', ''), b('numbered', ''),
        ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].flatMap((d) => [b('h3', d), b('todo', '')]),
        b('h2', 'Weekend'), b('bullet', ''),
        b('divider'),
        b('quote', 'Reflection: what went well, what didn’t?'),
      ],
    }),
  },
  {
    id: 'travel', name: 'Travel planner', icon: '✈️', category: 'Personal', desc: 'Itinerary, bookings and packing list.',
    build: () => ({
      title: 'Trip plan', icon: '✈️', cover: 'gradient:peach',
      blocks: [
        b('callout', 'Dates: · Flights: · Stay: ', { icon: '🧳' }),
        b('h2', 'Itinerary'),
        b('toggle', 'Day 1', { open: true, body: '' }), b('toggle', 'Day 2', { open: false, body: '' }), b('toggle', 'Day 3', { open: false, body: '' }),
        b('h2', 'Packing list'), b('todo', 'Passport'), b('todo', 'Chargers'), b('todo', 'Comfortable shoes'),
        b('h2', 'Places to eat'), b('bullet', ''),
      ],
    }),
  },
  {
    id: 'journal', name: 'Daily journal', icon: '📓', category: 'Personal', desc: 'A simple daily reflection.',
    build: () => ({
      title: today(), icon: '📓',
      blocks: [
        b('h3', 'Grateful for'), b('bullet', ''),
        b('h3', 'Today I want to'), b('todo', ''),
        b('h3', 'Notes'), b('p', ''),
      ],
    }),
  },
  {
    id: 'habits', name: 'Habit tracker', icon: '🔥', category: 'Personal', desc: 'Check off habits every day.',
    build: () => ({
      title: 'Habit tracker', icon: '🔥', kind: 'database', view: 'table',
      schema: [
        { id: 'date', name: 'Date', type: 'date' },
        { id: 'exercise', name: 'Exercise', type: 'checkbox' },
        { id: 'read', name: 'Read 20 min', type: 'checkbox' },
        { id: 'water', name: 'Water (glasses)', type: 'number' },
      ],
      rows: [0, -1, -2].map((n) => ({ title: n === 0 ? 'Today' : `Day ${-n} ago`, props: { date: iso(n), exercise: n !== -1, read: n === 0, water: 6 + n } })),
    }),
  },
];
