'use strict';
// Sample workspace every new account starts with, so no screen is ever empty.
const crypto = require('crypto');

const id = () => crypto.randomBytes(6).toString('hex');
const b = (type, html = '', extra = {}) => ({ id: id(), type, html, ...extra });
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const STATUS = [
  { name: 'Not started', color: 'gray' },
  { name: 'In progress', color: 'blue' },
  { name: 'Done', color: 'green' },
];

function seedWorkspace(ownerId, ownerName) {
  const first = (ownerName || 'there').split(' ')[0];
  const now = Date.now();
  const pages = [];
  let order = 0;
  const page = (fields) => {
    const p = {
      id: id(), ownerId, parentId: null, kind: 'page', title: 'Untitled', icon: '', cover: '',
      blocks: [], favorite: false, trashed: false, published: false, row: false, props: {},
      createdAt: now, updatedAt: now - Math.floor(Math.random() * 1000 * 60 * 60 * 30), order: order++,
      ...fields,
    };
    pages.push(p);
    return p;
  };

  // 1. Welcome
  const welcome = page({
    title: `Welcome to PumpitYeah`, icon: '👋', favorite: true,
    cover: 'gradient:sunrise',
    blocks: [
      b('callout', `Hey ${first}! This is your workspace. Everything here is editable — click anywhere and start typing.`, { icon: '💡' }),
      b('h2', 'The basics'),
      b('todo', 'Click anywhere on this page and start typing', { checked: true }),
      b('todo', 'Type <code>/</code> to see every block you can add — headings, to-dos, code, images, databases'),
      b('todo', 'Highlight any text to <b>bold</b>, <i>italicize</i>, add a link, or <b>Ask AI</b> to rewrite it'),
      b('todo', 'Press <code>Space</code> on an empty line to ask PumpitYeah AI to write for you'),
      b('todo', 'Drag the <code>⋮⋮</code> handle on the left of any block to reorder it'),
      b('todo', 'Press <code>Ctrl/⌘ + K</code> to search across every page'),
      b('h2', 'Markdown shortcuts'),
      b('p', 'Type these at the start of a line:'),
      b('bullet', '<code>#</code>, <code>##</code>, <code>###</code> for headings'),
      b('bullet', '<code>-</code> for a bulleted list, <code>1.</code> for numbered'),
      b('bullet', '<code>[]</code> for a to-do, <code>&gt;</code> for a toggle, <code>"</code> for a quote'),
      b('bullet', '<code>```</code> for a code block and <code>---</code> for a divider'),
      b('toggle', 'Click the arrow to open this toggle', { open: false, body: 'Toggles hide details until you need them. Great for FAQs, meeting notes, and long specs.' }),
      b('divider'),
      b('quote', 'The best workspace is the one you actually use. Make it yours. Yeah.'),
    ],
  });

  // 2. Project tracker (database)
  const tracker = page({
    title: 'Q4 Launch Tracker', icon: '🚀', kind: 'database', view: 'table', favorite: true,
    cover: 'gradient:ocean',
    blocks: [],
    schema: [
      { id: 'status', name: 'Status', type: 'status', options: STATUS },
      { id: 'owner', name: 'Owner', type: 'person' },
      { id: 'due', name: 'Due', type: 'date' },
      { id: 'priority', name: 'Priority', type: 'select', options: [
        { name: 'High', color: 'red' }, { name: 'Medium', color: 'yellow' }, { name: 'Low', color: 'gray' },
      ] },
      { id: 'tags', name: 'Tags', type: 'multi_select', options: [
        { name: 'Design', color: 'purple' }, { name: 'Engineering', color: 'blue' },
        { name: 'Marketing', color: 'orange' }, { name: 'Research', color: 'green' },
      ] },
    ],
  });
  const tasks = [
    ['Finalize pricing page copy', 'In progress', 'Maya Chen', 3, 'High', ['Marketing']],
    ['Ship onboarding checklist v2', 'In progress', ownerName, 6, 'High', ['Engineering', 'Design']],
    ['Customer interviews: 8 teams', 'Done', 'Jordan Lee', -4, 'Medium', ['Research']],
    ['Launch video storyboard', 'Not started', 'Priya Patel', 12, 'Medium', ['Marketing', 'Design']],
    ['Load test the new sync engine', 'Not started', 'Sam Okafor', 9, 'High', ['Engineering']],
    ['Update help center articles', 'Not started', 'Maya Chen', 15, 'Low', ['Marketing']],
    ['Accessibility audit', 'Done', 'Priya Patel', -2, 'Medium', ['Design', 'Engineering']],
  ];
  tasks.forEach(([title, status, owner, due, priority, tags]) => page({
    parentId: tracker.id, row: true, title, icon: '',
    props: { status, owner, due: daysFromNow(due), priority, tags },
    blocks: [
      b('h3', 'Context'),
      b('p', `Part of the Q4 launch. Owner: ${owner}.`),
      b('h3', 'Checklist'),
      b('todo', 'Draft', { checked: status !== 'Not started' }),
      b('todo', 'Review with team', { checked: status === 'Done' }),
      b('todo', 'Ship it', { checked: status === 'Done' }),
    ],
  }));

  // 3. Meeting notes with sub-pages
  const meetings = page({
    title: 'Meeting Notes', icon: '🗓️',
    blocks: [
      b('p', 'All team meetings live here. Use the <b>Meeting notes</b> template for new ones.'),
    ],
  });
  const sync = page({
    parentId: meetings.id, title: 'Weekly Sync — Product', icon: '📝',
    blocks: [
      b('callout', 'Attendees: Maya, Jordan, Priya, Sam, ' + ownerName, { icon: '👥' }),
      b('h2', 'Agenda'),
      b('numbered', 'Launch readiness review'),
      b('numbered', 'Interview takeaways'),
      b('numbered', 'Open questions on pricing'),
      b('h2', 'Notes'),
      b('bullet', 'Onboarding v2 is on track; QA starts Monday.'),
      b('bullet', 'Six of eight interviewed teams asked for <b>offline mode</b>. Jordan to write up a proposal.'),
      b('bullet', 'Pricing: leaning toward a generous free tier with AI add-on. Maya to draft two options.'),
      b('bullet', 'Sync engine load test is blocked on staging capacity.'),
      b('h2', 'Action items'),
      b('todo', 'Jordan — offline mode proposal by Thursday'),
      b('todo', 'Maya — two pricing page variants'),
      b('todo', 'Sam — request extra staging capacity', { checked: true }),
    ],
  });
  page({
    parentId: meetings.id, title: '1:1 with Maya', icon: '☕',
    blocks: [
      b('h3', 'Wins'),
      b('bullet', 'Pricing research deck landed well with leadership.'),
      b('h3', 'Blockers'),
      b('bullet', 'Waiting on legal review for the new terms page.'),
      b('h3', 'Growth'),
      b('p', 'Maya wants to lead the launch event. Pair with Priya on the storyboard first.'),
    ],
  });
  welcome.blocks.splice(1, 0, b('page', '', { pageId: sync.id }));

  // 4. Team wiki
  const wiki = page({
    title: 'Team Wiki', icon: '📚', cover: 'gradient:forest',
    blocks: [
      b('p', 'Everything you need to know about how we work. Start with the handbook.'),
    ],
  });
  const handbook = page({
    parentId: wiki.id, title: 'Engineering Handbook', icon: '🛠️',
    blocks: [
      b('h2', 'How we ship'),
      b('p', 'Small pull requests, reviewed within one business day, deployed behind flags.'),
      b('h3', 'Local setup'),
      b('code', 'git clone git@github.com:acme/app.git\ncd app\nnpm install\nnpm run dev', { lang: 'bash' }),
      b('h3', 'Code review'),
      b('bullet', 'Review for correctness first, style second.'),
      b('bullet', 'Leave at least one thing you liked.'),
      b('bullet', 'Approve when it is better than main, not when it is perfect.'),
      b('callout', 'On-call rotates weekly. The schedule lives in the #oncall channel.', { icon: '🚨' }),
    ],
  });
  const onboarding = page({
    parentId: wiki.id, title: 'New Hire Onboarding', icon: '🌱',
    blocks: [
      b('h2', 'Week 1'),
      b('todo', 'Get laptop and accounts set up'),
      b('todo', 'Read the Engineering Handbook'),
      b('todo', 'Ship a tiny change to production'),
      b('h2', 'Week 2'),
      b('todo', 'Shadow an on-call shift'),
      b('todo', 'Pick up your first real project'),
    ],
  });
  wiki.blocks.push(b('page', '', { pageId: handbook.id }), b('page', '', { pageId: onboarding.id }));

  // 5. Reading list (board database)
  const reading = page({
    title: 'Reading List', icon: '📖', kind: 'database', view: 'board',
    schema: [
      { id: 'status', name: 'Status', type: 'status', options: [
        { name: 'To read', color: 'gray' }, { name: 'Reading', color: 'yellow' }, { name: 'Finished', color: 'green' },
      ] },
      { id: 'author', name: 'Author', type: 'text' },
      { id: 'type', name: 'Type', type: 'select', options: [
        { name: 'Book', color: 'brown' }, { name: 'Article', color: 'blue' }, { name: 'Podcast', color: 'pink' },
      ] },
      { id: 'rating', name: 'Rating', type: 'number' },
    ],
  });
  [
    ['Shape Up', 'To read', 'Ryan Singer', 'Book', null],
    ['The Mom Test', 'Finished', 'Rob Fitzpatrick', 'Book', 5],
    ['Thinking in Systems', 'Reading', 'Donella Meadows', 'Book', null],
    ['Working Backwards', 'To read', 'Colin Bryar & Bill Carr', 'Book', null],
    ['Make Something People Want', 'Finished', 'Paul Graham', 'Article', 4],
    ['The Pragmatic Programmer', 'Reading', 'Hunt & Thomas', 'Book', null],
  ].forEach(([title, status, author, type, rating]) => page({
    parentId: reading.id, row: true, title, props: { status, author, type, rating },
    blocks: [b('h3', 'Key ideas'), b('bullet', ''), b('h3', 'Favorite quote'), b('quote', '')],
  }));

  // 6. Trip planner
  page({
    title: 'Trip to Lisbon', icon: '✈️', cover: 'gradient:peach',
    blocks: [
      b('callout', `Flights booked for ${daysFromNow(40)}. Hotel confirmation is in email.`, { icon: '🧳' }),
      b('h2', 'Itinerary'),
      b('toggle', 'Day 1 — Alfama & Baixa', { open: true, body: 'Tram 28 in the morning, São Jorge Castle, pastéis at Manteigaria, fado dinner.' }),
      b('toggle', 'Day 2 — Belém', { open: false, body: 'Jerónimos Monastery, Belém Tower, MAAT, the original Pastéis de Belém.' }),
      b('toggle', 'Day 3 — Sintra day trip', { open: false, body: 'Pena Palace early, Quinta da Regaleira, travesseiros at Piriquita.' }),
      b('h2', 'Packing'),
      b('todo', 'Passport', { checked: true }),
      b('todo', 'Walking shoes (the hills are real)'),
      b('todo', 'Power adapter (Type F)'),
      b('todo', 'Light jacket'),
    ],
  });

  // 7. Journal
  page({
    title: 'Ideas & Journal', icon: '💭',
    blocks: [
      b('h3', 'Product ideas'),
      b('bullet', 'A "focus mode" that hides everything but the current block'),
      b('bullet', 'Weekly digest email of what changed in your workspace'),
      b('h3', 'Today'),
      b('p', 'Good energy in the sync. The offline mode signal is too strong to ignore.'),
    ],
  });

  return pages;
}

module.exports = { seedWorkspace };
