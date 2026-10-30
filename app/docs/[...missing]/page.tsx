import {notFound} from 'next/navigation';
// Multi-segment paths are never document filenames. Keep them inside the docs
// error boundary without opening any repository path.
export default function UnpublishedPath(){notFound();}
