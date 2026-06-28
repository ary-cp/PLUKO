export function KeyboardHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="pause-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div className="pause-overlay__content shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="pause-overlay__title">Keyboard Shortcuts</div>
        
        <div className="shortcuts-grid">
          <div className="shortcut-row">
            <kbd>?</kbd><span>Show this help menu</span>
          </div>
          <div className="shortcut-row">
            <kbd>/</kbd><span>Focus Search Box</span>
          </div>
          <div className="shortcut-row">
            <kbd>Esc</kbd><span>Unfocus / Close Modals</span>
          </div>
          <div className="shortcut-row">
            <kbd>Alt</kbd> + <kbd>K</kbd><span>Toggle KPIs Panel</span>
          </div>
          <div className="shortcut-row">
            <kbd>Alt</kbd> + <kbd>F</kbd><span>Toggle Filters Panel</span>
          </div>
          <div className="shortcut-row">
            <kbd>Alt</kbd> + <kbd>G</kbd><span>Toggle Grid Panel</span>
          </div>
          <div className="shortcut-row">
            <kbd>Alt</kbd> + <kbd>D</kbd><span>Toggle Dept Chart</span>
          </div>
          <div className="shortcut-row">
            <kbd>Alt</kbd> + <kbd>I</kbd><span>Toggle Infrastructure</span>
          </div>
          <div className="shortcut-row">
            <kbd>Space</kbd><span>Play / Pause Stream</span>
          </div>
        </div>

        <button className="btn is-accent" style={{ marginTop: '24px' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
