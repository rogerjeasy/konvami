import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** What to show instead of the children once one of them has broken; `retry` shows them again. */
  fallback: (retry: () => void) => ReactNode;
  /** When this changes (another screen was opened), the children are shown again. */
  resetKey?: string;
}

interface State {
  failed: boolean;
}

/**
 * Catches an error thrown while its children render, so a broken screen shows `fallback` and
 * not a blank window (or, in development, only the red error overlay). React offers this for
 * class components only.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.retry();
  }

  retry = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children;
  }
}
