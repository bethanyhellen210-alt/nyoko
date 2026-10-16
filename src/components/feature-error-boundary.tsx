import React from 'react';

type Props = { children: React.ReactNode; featureName: string };
type State = { error: Error | null };

export default class FeatureErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[${this.props.featureName}] render failed`, error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <section role='alert' style={{ margin: '1rem', padding: '1.5rem', border: '1px solid #b42318', borderRadius: '8px', color: 'var(--text-general)', background: 'var(--general-section-1)' }}>
                <h2 style={{ marginTop: 0 }}>{this.props.featureName} could not load</h2>
                <p>The page stopped because of a runtime error. Your account and trade settings have not been changed by this message.</p>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12px' }}>{this.state.error.message}</pre>
                <button type='button' onClick={() => this.setState({ error: null })}>Try again</button>
            </section>
        );
    }
}
