import { setLinux } from './platform';

// the existing tests expect the Windows texts and layout, whatever OS runs them
setLinux(false);
