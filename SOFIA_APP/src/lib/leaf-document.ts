export type Mark={start:number;end:number;bold?:boolean;italic?:boolean;underline?:boolean;strike?:boolean;code?:boolean;color?:string;highlight?:string};
export type LeafBlock={id:string;text:string;type:string;marks:Mark[];checked?:boolean;align?:'left'|'center'|'right'};
export type Leaf={id:string;title:string;content:string;created_at?:string;blocks?:LeafBlock[];properties?:{id:string;name:string;value:string}[]};
export const leafId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
export function leafBlocks(leaf:Leaf):LeafBlock[]{return leaf.blocks?.length?leaf.blocks:[{id:leaf.id+'-body',text:leaf.content||'',type:'text',marks:[]}];}
export function editBlockText(block:LeafBlock,text:string,typing:Partial<Mark>={}):LeafBlock{
 let start=0;while(start<block.text.length&&start<text.length&&block.text[start]===text[start])start++;
 let oldEnd=block.text.length,end=text.length;while(oldEnd>start&&end>start&&block.text[oldEnd-1]===text[end-1]){oldEnd--;end--;}
 const delta=end-oldEnd;
 const marks=(block.marks||[]).map(m=>({...m,start:m.start<=start?m.start:m.start>=oldEnd?m.start+delta:start,end:m.end<start?m.end:m.end>=oldEnd?m.end+delta:end})).filter(m=>m.end>m.start);
 if(end>start&&Object.keys(typing).length)marks.push({...typing,start,end});
 return {...block,text,marks};
}
export function formatRange(block:LeafBlock,start:number,end:number,style:Partial<Mark>):LeafBlock{
 if(end<=start)return block;const parts:Mark[]=[];
 for(const m of block.marks||[]){if(m.end<=start||m.start>=end){parts.push(m);continue;}if(m.start<start)parts.push({...m,end:start});parts.push({...m,start:Math.max(m.start,start),end:Math.min(m.end,end),...style});if(m.end>end)parts.push({...m,start:end});}
 parts.push({start,end,...style});return {...block,marks:parts};
}
export function textRuns(block:LeafBlock){const stops=[...new Set([0,block.text.length,...(block.marks||[]).flatMap(m=>[Math.max(0,Math.min(block.text.length,m.start)),Math.max(0,Math.min(block.text.length,m.end))])])].sort((a,b)=>a-b);return stops.slice(0,-1).map((start,i)=>{const end=stops[i+1],style:Partial<Mark>={};for(const m of block.marks||[])if(m.start<=start&&m.end>=end)Object.assign(style,m);return {start,end,text:block.text.slice(start,end),style};});}
