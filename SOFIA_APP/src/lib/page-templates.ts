import type {PageBlock} from './page-editor';

export type TemplateId='tasks_personal'|'notes_hub'|'playlist_links';
export type PageTemplate={
 id:TemplateId;title:string;description:string;icon:string;
 blocks:PageBlock[];
};

const id=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const block=(type:string,text='',data:Record<string,any>={}):PageBlock=>({id:id(),type,text,data});

export const STATUS_COLORS:{id:string;label:string;hex:string}[]=[
 {id:'gray',label:'Cinza',hex:'#8e8e93'},{id:'red',label:'Vermelho',hex:'#e05a5a'},
 {id:'orange',label:'Laranja',hex:'#d9822b'},{id:'yellow',label:'Amarelo',hex:'#c9a227'},
 {id:'green',label:'Verde',hex:'#42a56b'},{id:'teal',label:'Turquesa',hex:'#2d9c9c'},
 {id:'blue',label:'Azul',hex:'#4285d4'},{id:'purple',label:'Roxo',hex:'#8b67d5'},
 {id:'pink',label:'Rosa',hex:'#d66aa6'}
];
export const statusColorHex=(id:string)=>STATUS_COLORS.find(x=>x.id===id)?.hex||STATUS_COLORS[0].hex;

export const PAGE_TEMPLATES:PageTemplate[]=[
 {
  id:'tasks_personal',title:'Tarefas pessoal',description:'Quadro de tarefas com status editáveis.',icon:'✅',
  blocks:[block('collection','',{
   title:'',show_title:false,
   properties:[
    {key:'name',label:'Nome',type:'text',options:[]},
    {key:'status',label:'Status',type:'select',options:['Não iniciada','Prioridade'],option_colors:{'Não iniciada':'gray','Prioridade':'red'}}
   ],
   views:[{id:'board',label:'Quadro',type:'board',group_by:'status',filter_key:'',filter_value:'',sort_by:'',sort_dir:'desc'}],
   active_view:'board',rows:[]
  })]
 },
 {
  id:'notes_hub',title:'Anotações',description:'Cadernos com folhas próprias e edição livre.',icon:'📝',
  blocks:[block('collection','',{title:'Anotações',show_title:true,mode:'notebooks',notebooks:[],properties:[{key:'name',label:'Nome',type:'text'}],views:[{id:'notebooks',label:'Anotações',type:'pages'}],active_view:'notebooks',rows:[]})]
 },
 {
  id:'playlist_links',title:'Coleção',description:'Campos livres para organizar o que você quiser.',icon:'🔗',
  blocks:[
   block('collection','',{
    title:'',show_title:false,
    properties:[
     {key:'name',label:'Nome',type:'text',options:[]},
          {key:'category',label:'Categoria',type:'text',placeholder:'Adicionar…'},
     {key:'description',label:'Descrição',type:'text',placeholder:'Adicionar…'},
     {key:'created',label:'Criado em',type:'date',options:[]}
    ],
    views:[{id:'links',label:'Coleção',type:'table',group_by:'',filter_key:'',filter_value:'',sort_by:'created',sort_dir:'desc'}],
    active_view:'links',rows:[]
   })
  ]
 }
];

export function freshTemplate(template:PageTemplate):PageTemplate{
 const clone=JSON.parse(JSON.stringify(template)) as PageTemplate;
 clone.blocks=clone.blocks.map(b=>({...b,id:id(),data:{...(b.data||{}),rows:Array.isArray(b.data?.rows)?b.data.rows.map((r:any)=>({...r,id:id()})):b.data?.rows}}));
 return clone;
}

/** Insert structure without erasing personal content. A single untouched guide block is replaced. */
export function insertTemplateBlocks(existing:readonly PageBlock[],incoming:readonly PageBlock[]):PageBlock[]{
 const blank=existing.length===1&&existing[0].type==='text'&&!existing[0].text&&!existing[0].html;
 const added=JSON.parse(JSON.stringify(incoming)) as PageBlock[];
 return blank?added:[...existing,...added];
}
