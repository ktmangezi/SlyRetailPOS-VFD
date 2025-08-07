import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void }>;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} resetError={this.resetError} />;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50">
          <div className="container mx-auto py-4 sm:py-8 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-red-600 mb-4">Application Error</h1>
                <p className="text-gray-600 mb-4">
                  An error occurred while rendering the page. Please refresh to continue.
                </p>
                <div className="space-x-4">
                  <button 
                    onClick={this.resetError}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Try Again
                  </button>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                  >
                    Refresh Page
                  </button>
                </div>
                {this.state.error && (
                  <details className="mt-4 text-left bg-gray-100 p-4 rounded">
                    <summary className="cursor-pointer font-medium">Error Details</summary>
                    <pre className="mt-2 text-sm text-red-600 whitespace-pre-wrap">
                      {this.state.error.message}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}