'use client';

import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Contains rendering failures to one panel; the rest of the lab keeps working. */
export default class ErrorBoundary extends Component<{ children: ReactNode; label: string; resetKey?: unknown }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="m-3 rounded-sm border border-critical/60 bg-surface p-3 text-[12px] text-ink-2">
          <strong className="text-ink">{this.props.label} could not be rendered.</strong> {this.state.error.message}
          <button type="button" onClick={() => this.setState({ error: null })} className="ml-2 underline">
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
