import {Children,isValidElement,type ReactNode} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {headingId,publicDocLink} from '../../src/docs/catalog';
function text(children:ReactNode):string{return Children.toArray(children).map(c=>typeof c==='string'||typeof c==='number'?String(c):isValidElement<{children?:ReactNode}>(c)?text(c.props.children):'').join('');}
export default function PublicMarkdown({children}:{children:string}){
 return <Markdown skipHtml remarkPlugins={[remarkGfm]} disallowedElements={['img','script','style','iframe','form','input','button']} components={{
  h2:({children})=><h2 id={headingId(text(children))}>{children}</h2>,
  a:({href,children})=>{const safe=publicDocLink(href);return safe?<a href={safe}>{children}</a>:<span>{children}</span>;},
  table:({children})=><div className="docs-table-wrap" role="region" aria-label="Guide reference table" tabIndex={0}><table>{children}</table></div>
 }}>{children}</Markdown>;
}
