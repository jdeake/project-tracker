# Project Tracker (Electron + React + React Flow)

Visual hierarchical task tracker with diagram and list views.

## Run on your Mac

```bash
cd project-tracker
npm install
npm run electron:dev
```

The first time it may take a minute to install. It opens an Electron window with:

- Diagram view (React Flow canvas) showing Phase → Block → Tasks
- Horizontal edges as predecessors
- List view with person, dates, % complete, allocation, hours
- Live estimated cost based on each person's labor rate

## Next steps you can add

- Drag-and-drop creation of new tasks/blocks/phases
- Vertical "all must finish" grouping
- Baseline save/compare
- Swim-lane views
- Persistence (JSON file or SQLite)
