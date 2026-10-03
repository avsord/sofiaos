import type {PageBlock} from './page-editor';

export type TemplateId='tasks_personal'|'notes_hub'|'playlist_links';
export type PageTemplate={
 id:TemplateId;title:string;description:string;icon:string;
 cover_type:string;cover_value:string;blocks:PageBlock[];
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
  id:'tasks_personal',title:'Tarefas pessoal',description:'Quadro de tarefas com colunas de status totalmente editáveis.',icon:'🧏',
  cover_type:'',cover_value:'',
  blocks:[block('collection','',{
   title:'',show_title:false,
   properties:[
    {key:'name',label:'Nome',type:'text',options:[]},
    {key:'status',label:'Status',type:'select',options:['Não iniciada','Prioridade'],option_colors:{'Não iniciada':'gray','Prioridade':'red'}}
   ],
   views:[{id:'board',label:'Visualização em quadro',type:'board',group_by:'status',filter_key:'',filter_value:'',sort_by:'',sort_dir:'desc'}],
   active_view:'board',rows:[]
  })]
 },
 {
  id:'notes_hub',title:'Bloco de nota',description:'Cadernos e notas em uma página limpa, no estilo da referência.',icon:'📖',
  cover_type:'',cover_value:'',
  blocks:[
   block('heading2','Cadernos'),
   block('collection','',{
    title:'Cadernos',show_title:false,
    properties:[{key:'name',label:'Nome',type:'text',options:[]}],
    views:[{id:'main',label:'Principais',type:'pages',group_by:'',filter_key:'',filter_value:'',sort_by:'',sort_dir:'desc'}],
    active_view:'main',rows:[]
   }),
   block('collection','',{
    title:'Notas',show_title:false,
    properties:[{key:'name',label:'Nome',type:'text',options:[]}],
    views:[{id:'notes',label:'Notas',type:'list',group_by:'',filter_key:'',filter_value:'',sort_by:'',sort_dir:'desc'}],
    active_view:'notes',rows:[
     {id:id(),values:{name:'Notas - db'},page_content:''},
     {id:id(),values:{name:'Meditações'},page_content:''}
    ]
   })
  ]
 },
 {
  id:'playlist_links',title:'Lista de reprodução',description:'Gerenciador de links com orientação, URL, categoria e data de criação.',icon:'▶️',
  cover_type:'preset',cover_value:'linear-gradient(135deg,#102b75,#173b98)',
  blocks:[
   block('callout','Quick-capture new links using Notion Web Clipper',{icon:'➤'}),
   block('callout','Guidance',{icon:'ℹ️'}),
   block('collection','',{
    title:'Link Manager',show_title:false,
    properties:[
     {key:'name',label:'Name',type:'text',options:[]},
     {key:'url',label:'URL',type:'url',options:[]},
     {key:'category',label:'Category',type:'select',options:['Vídeo','Artigo','Curso','Referência'],option_colors:{Vídeo:'blue',Artigo:'green',Curso:'purple','Referência':'gray'}},
     {key:'created',label:'Created',type:'date',options:[]}
    ],
    views:[{id:'links',label:'Link Manager',type:'table',group_by:'',filter_key:'',filter_value:'',sort_by:'created',sort_dir:'desc'}],
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
