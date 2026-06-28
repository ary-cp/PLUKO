import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { engine } from '../store/StateEngine';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleDownloadLog = () => {
    const logData = {
      timestamp: new Date().toISOString(),
      error: this.state.error?.toString(),
      componentStack: this.state.errorInfo?.componentStack,
      engineState: {
        paused: engine.isPaused(),
        pendingCount: engine.pendingCount(),
        filters: engine.getActiveFilters(),
        search: engine.getSearch(),
      }
    };

    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rpa-monitor-crash-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <h1 className="error-boundary__title">⚠️ System Failure</h1>
            <p className="error-boundary__msg">
              A critical error occurred in the React rendering tree.
            </p>
            <div className="error-boundary__details">
              <code>{this.state.error?.toString()}</code>
            </div>
            <div className="error-boundary__actions">
              <button className="btn is-accent" onClick={this.handleDownloadLog}>
                ⭳ Download Crash Log
              </button>
              <button className="btn" onClick={this.handleReload}>
                ⟳ Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
