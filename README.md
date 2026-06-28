# PLUKO: High-Density Enterprise RPA Monitor

A highly performant, real-time dashboard for monitoring Robotic Process Automation (RPA) telemetry. Engineered for **maximum performance**, this application can handle over 100,000 live data rows with a 200ms tick rate without breaking a sweat.

## 🚀 The "Vanilla Flex" - Custom Data Virtualization
**We did not use any pre-built virtualization libraries (like `react-window` or `ag-grid`).**
Instead, we built a **Custom DOM-Pooling Virtualization Engine** completely from scratch:
- **Zero-Allocation Updates:** DOM nodes are recycled and mutated in-place using direct `nodeValue` and `classList` updates, bypassing React's reconciliation phase for the hot-path.
- **Micro-Batched Rendering:** Integrated seamlessly with `requestAnimationFrame` and an offline `StateEngine`, ensuring the main thread is never blocked.
- **Memory Efficient:** Only the visible rows (plus a small buffer) exist in the DOM. Sorting and filtering operate directly on typed data structures.

## 🎨 Premium Glassmorphism UI
**We did not rely on UI component libraries (like Shadcn, Radix, or Framer Motion) for the core aesthetic.**
- **Pure CSS Mastery:** The UI is constructed using vanilla CSS featuring a premium dark-mode glassmorphism aesthetic.
- **Hardware-Accelerated Animations:** Smooth sliding drawers, subtle glowing hover states, and anomaly pulsing are handled directly via CSS compositing.
- **Terminal Vibe:** Designed to feel like a high-end Bloomberg terminal for RPA analysts.

## ✨ Key Features
- **Live 200ms Telemetry Stream:** Consumes simulated streaming data via Web Workers.
- **Instant Search & Filter:** Multi-categorical filters and full-text search computed in milliseconds.
- **Multi-Sort:** Stable sorting algorithm supporting multiple column priorities.
- **Analytics View (Bounty 2):** Comprehensive department charts and infrastructure panels synced with live data.
- **Stream Controls (Feature 5):** Pause, buffer, and resume the live stream at will.
- **CSV Export:** Download a snapshot of the current view, processed entirely in a background Web Worker.

## 🛠️ Setup & Run

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

## 🏗️ Architecture Highlight
- `StateEngine.ts`: The central nervous system. A non-React class that ingests data, maintains the 100k+ row pool, and notifies subscribers.
- `VirtualGrid.tsx`: The custom rendering layer. Bypasses React for row updates, ensuring 60fps scrolling under heavy mutation.
- `csvWorker.ts`: Offloads heavy CSV parsing and formatting to a background thread to prevent UI freezing.
