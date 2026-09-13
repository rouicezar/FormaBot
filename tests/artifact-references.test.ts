import {test,expect} from 'vitest';
import {artifactAliases,artifactMentions} from '../src/desktop/artifact-references';
const ref={path:'/project/outputs/口播稿评审打回_视频策划员_20260912.md',taskId:'review'};
test('registered title, filename and relative path become compact references in place',()=>{
 const aliases=artifactAliases([ref],['视频策划员']);for(const text of ['检查《口播稿评审打回》后完成复核。','交付文件 outputs/口播稿评审打回_视频策划员_20260912.md，供审核。',ref.path]){const found=artifactMentions(text,aliases);expect(found).toHaveLength(1);expect(found[0].reference).toEqual(ref);expect(found[0].label).not.toContain('/');}
});
test('ambiguous titles, unsubmitted paths, and filenames inside other paths remain plain text',()=>{
 const aliases=artifactAliases([ref,{path:'/other/口播稿评审打回_视频策划员_20260912.md',taskId:'other'}],['视频策划员']);expect(artifactMentions('检查《口播稿评审打回》',aliases)).toEqual([]);expect(artifactMentions('建议 outputs/未生成.html',aliases)).toEqual([]);expect(artifactMentions('/unrelated/口播稿评审打回_视频策划员_20260912.md',aliases)).toEqual([]);expect(artifactMentions(ref.path,aliases)).toHaveLength(1);
});
test('longest registered name wins, repeated references remain at each mention',()=>{
 const aliases=artifactAliases([{path:'/p/验收.md',taskId:'a'},{path:'/p/验收说明.md',taskId:'b'}]);const found=artifactMentions('验收说明.md，随后检查《验收说明》。',aliases);expect(found).toHaveLength(2);expect(found.every(m=>m.reference.taskId==='b')).toBe(true);
});
