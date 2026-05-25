# HandRecog Pro

HandRecog Pro is a high-precision, zero-hardware touchless presentation control system that operates completely inside your web browser. By leveraging standard webcams and real-time machine learning landmark regression, it translates intuitive hand gestures into fluid presentation commands like slide navigation, zooming, and volume adjustments.

---

## Features

- **Zero-Hardware Footprint:** Works on any basic laptop with a standard webcam—no external clickers or sensors required.
- **Complete File Support:** Upload and parse .pptx presentations or render high-resolution .pdf files directly in the browser sandboxed environment.
- **Intuitive Gesture Matrix:**
  - **Open Palm:** Advance to the next slide.
  - **Closed Fist / Kinetic Swipe:** Return to the previous slide.
  - **Thumbs Up:** Zoom in on the active slide viewport.
  - **Thumbs Down:** Zoom out of the active slide viewport.
  - **Pinch & Hover:** Linear, continuous volume tracking slider.
- **Smart Cooldown Timers (Temporal Debouncing):** Built-in algorithmic delays to prevent accidental double-triggers and double-skipping.
- **100% Client-Side Privacy:** All computer vision computations, image frames, and presentation files are processed locally on your computer. Nothing is ever uploaded to a server.

---

## Tech Stack & Tools

- **Frontend:** HTML5, CSS3 (Modern Glassmorphic UI Dashboard)
- **Core Engine:** Vanilla JavaScript (ES6+)
- **Machine Vision Pipeline:** Lightweight Deep Learning Pipeline (Pre-trained on 30,000+ real and synthetic images for 21-point hand joint tracking)
- **Document Parsing:** JSZip (for XML unpacking of PPTX assets) & PDF.js (for client-side canvas rasterization)

---

## How It Works: The Formulas

The application sits on top of a raw 21-point tracking coordinate matrix and uses precise geometric thresholds to classify movements:

### 1. Spatial Vector Distance
To track gestures like finger pinches and curls, we continuously calculate the Euclidean distance ($d$) between specific joint arrays:

$$d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$

### 2. Algorithmic Gesture Separation (Fist vs. Thumbs Up)
To prevent a tight fist from accidentally being misread as a Thumbs Up, the system monitors the distance between the Thumb Tip and the Index Finger Knuckle:

$$\text{Thumb\_Extension} = \sqrt{(x_{\text{thumb\_tip}} - x_{\text{index\_knuckle}})^2 + (y_{\text{thumb\_tip}} - y_{\text{index\_knuckle}})^2}$$

- If $\text{Thumb\_Extension} < 0.08$ $\rightarrow$ **Closed Fist**
- If $\text{Thumb\_Extension} \ge 0.08$ $\rightarrow$ **Thumbs Up/Down**

### 3. Kinetic Swipe Velocity
Rapid slide-changing actions are calculated by measuring horizontal positional shift ($\Delta x$) over a historical frame rate slice ($\Delta t < 350\text{ms}$):

$$Velocity = \frac{\Delta x}{\Delta t}$$

---

## Getting Started

Since HandRecog Pro is completely self-contained and client-side, setting it up takes less than a minute.

### Prerequisites
A modern, web-audio enabled browser (Chrome, Edge, Safari, or Firefox) and an active webcam.

### Installation & Launch
1. Clone this repository to your local machine:
```bash
   git clone [https://github.com/YOUR_USERNAME/HandRecog-Pro.git](https://github.com/YOUR_USERNAME/HandRecog-Pro.git)
