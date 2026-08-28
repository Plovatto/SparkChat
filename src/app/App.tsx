import { Container } from 'react-bootstrap';

export function App() {
  return (
    <Container
      fluid
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: '100vh' }}
    >
      <div className="text-center text-white">
        <h1>SparkChat</h1>
        <p className="text-white-50">
          Base do projeto pronta. Providers e features entram nas próximas fases.
        </p>
      </div>
    </Container>
  );
}
