import React from 'react';
import { C, TF } from '../tokens';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40, textAlign: "center", background: C.bg, minHeight: "100vh",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 16,
        }}>
          <div style={{ fontSize: 48, lineHeight: 1 }}>!</div>
          <div style={{ ...TF, fontSize: 24, fontWeight: 700, color: C.text }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 400, lineHeight: 1.6 }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              cursor: "pointer", borderRadius: 6, fontWeight: 600,
              padding: "10px 22px", fontSize: 14, minHeight: 44,
              background: C.accent, color: "#1a1a1a", border: "none",
              fontFamily: "inherit",
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
