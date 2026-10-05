/**
 * Shown while the page is captured again: a browser frame that fills with
 * placeholder lines under a moving scan line. The motion is opt-in through
 * prefers-reduced-motion in styles.css; without it the frame stays still.
 */
export default function CaptureOverlay({ label }) {
  return (
    <div className="capture-overlay" role="status">
      <div className="capture-card">
        <div className="capture-frame" aria-hidden="true">
          <div className="capture-frame-bar"><i /><i /><i /></div>
          <div className="capture-frame-page">
            <span /><span /><span /><span />
            <div className="capture-scan" />
          </div>
        </div>
        <p className="capture-title">Capturing at {label}…</p>
        <p className="capture-hint">The page loads in a browser in the background.</p>
      </div>
    </div>
  )
}
