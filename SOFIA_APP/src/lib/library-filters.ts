import type {Entity} from './types';
const RATING=/^sofia-(?:library|film)-rating-v1:([1-5])$/;
const TOPIC='sofia-topic-v1:';
export const LIBRARY_TOPIC_LIMIT=60-TOPIC.length;
export const isLibraryMeta=(tag:string)=>RATING.test(tag)||tag.startsWith(TOPIC);
export function libraryRating(record:Partial<Entity>):number {const tag=[...(record.tags||[])].reverse().find(t=>RATING.test(t));return tag?Number(RATING.exec(tag)![1]):0;}
type Presentation={facet:string;filter:string;all:string;empty:string;rating:string;key?:string;placeholder?:string;labels?:Record<string,string>};
const presentations:Record<string,Presentation>={
 film:{facet:'Gênero',filter:'Filtrar por gênero',all:'Todos os gêneros',empty:'Nenhum filme neste filtro',rating:'Sua avaliação do filme',key:'genre'},
 reading:{facet:'Gênero literário',filter:'Filtrar por gênero literário',all:'Todos os gêneros literários',empty:'Nenhuma leitura neste filtro',rating:'Sua avaliação da leitura',placeholder:'Ex.: romance, biografia'},
 book:{facet:'Gênero literário',filter:'Filtrar por gênero literário',all:'Todos os gêneros literários',empty:'Nenhum livro neste filtro',rating:'Sua avaliação do livro',placeholder:'Ex.: romance, biografia'},
 music:{facet:'Gênero musical',filter:'Filtrar por gênero musical',all:'Todos os gêneros musicais',empty:'Nenhuma música neste filtro',rating:'Sua avaliação da música',placeholder:'Ex.: rock, jazz, trilha sonora'},
 video:{facet:'Tema do vídeo',filter:'Filtrar por tema',all:'Todos os temas',empty:'Nenhum vídeo neste filtro',rating:'Sua avaliação do vídeo',placeholder:'Ex.: animação, história'},
 recipe:{facet:'Tipo de receita',filter:'Filtrar por tipo de receita',all:'Todos os tipos de receita',empty:'Nenhuma receita neste filtro',rating:'Sua avaliação da receita',placeholder:'Ex.: sobremesa, massa'},
 recipe_session:{facet:'Etapa da receita',filter:'Filtrar por etapa',all:'Todas as etapas',empty:'Nenhuma sessão neste filtro',rating:'Sua avaliação da sessão',placeholder:'Ex.: preparo, finalização'},
 source:{facet:'Assunto',filter:'Filtrar por assunto',all:'Todos os assuntos',empty:'Nenhuma fonte neste filtro',rating:'Sua avaliação da fonte',key:'scope'},
 asset:{facet:'Tipo de referência',filter:'Filtrar por tipo de referência',all:'Todos os tipos de referência',empty:'Nenhuma referência neste filtro',rating:'Sua avaliação da referência',key:'type',labels:{reference:'Referência',prompt:'Prompt','professional-link':'Link profissional',other:'Outro'}},
 file:{facet:'Origem do arquivo',filter:'Filtrar por origem',all:'Todas as origens',empty:'Nenhum arquivo neste filtro',rating:'Sua avaliação do arquivo',key:'provider',labels:{local:'Dispositivo',drive:'Google Drive',other:'Outra origem'}},
};
export function libraryPresentation(kind:string):Presentation{return presentations[kind]||{facet:'Categoria',filter:'Filtrar por categoria',all:'Todas as categorias',empty:'Nenhum registro neste filtro',rating:'Sua avaliação',placeholder:'Ex.: estudo, referência'};}
export function libraryTopic(record:Partial<Entity>):string {const p=libraryPresentation(record.kind||'');return p.key?String(record.data?.[p.key]||''):String((record.tags||[]).find(t=>t.startsWith(TOPIC))||'').slice(TOPIC.length);}
export function libraryTags(tags:string[],rating:number,topic=''):string[]{
 if(!Number.isInteger(rating)||rating<0||rating>5)throw Error('Escolha de 1 a 5 estrelas, ou remova a avaliação.');
 if(topic.trim().length>LIBRARY_TOPIC_LIMIT)throw Error('Use uma categoria mais curta.');
 const result=[...new Set(tags.filter(t=>!isLibraryMeta(t))),...(rating?['sofia-library-rating-v1:'+rating]:[]),...(topic.trim()?[TOPIC+topic.trim()]:[])];
 if(result.length>20)throw Error('Reduza as etiquetas para salvar a avaliação e a categoria.');return result;
}
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function libraryFacets(record:Partial<Entity>):string[]{const p=libraryPresentation(record.kind||'');return [...new Map(libraryTopic(record).split(/[,;/|]/).map(s=>s.trim()).filter(Boolean).map(s=>[normalized(s),p.labels?.[s]||s])).values()];}
export function facetOptions(records:Entity[]){return [...new Map(records.flatMap(r=>libraryFacets(r).map(label=>[normalized(label),label] as const))).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([value,label])=>({value,label}));}
export function filterLibrary(records:Entity[],stars:string,facet:string){return records.filter(r=>(stars==='all'||libraryRating(r)===Number(stars))&&(!facet||libraryFacets(r).some(value=>normalized(value)===normalized(facet))));}
