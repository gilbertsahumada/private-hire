import { LoadingState } from '../components/loading';

export default function Loading() {
  return (
    <main>
      <LoadingState label="Opening your page…" detail />
    </main>
  );
}
