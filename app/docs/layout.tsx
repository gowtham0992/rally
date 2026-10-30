import DocsNavigation from './navigation';
import './docs.css';
export default function DocsLayout({children}:{children:React.ReactNode}){
 return <div className="docs-frame"><a className="docs-skip" href="#docs-content">Skip to guide</a><aside className="docs-sidebar"><p className="docs-label">Rally guides</p><DocsNavigation/></aside><div className="docs-main-wrap"><details className="docs-mobile-menu"><summary>Rally guides <span aria-hidden="true">+</span></summary><DocsNavigation/></details><main id="docs-content" tabIndex={-1}>{children}</main></div></div>;
}
