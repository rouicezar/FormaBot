import {it,expect} from 'vitest';
import {artifactSnapshotName} from '../src/shared/artifacts';

it('derives stable, collision-free snapshot names per task and path',()=>{
  const a=artifactSnapshotName('task-1','outputs/report.md');
  expect(a).toBe(artifactSnapshotName('task-1','outputs/report.md'));
  expect(a.endsWith('report.md')).toBe(true);
  expect(artifactSnapshotName('task-2','outputs/report.md')).not.toBe(a);
  expect(artifactSnapshotName('task-1','outputs/other.md')).not.toBe(a);
});
