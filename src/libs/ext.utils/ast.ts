import { RootContext } from '..'
import { Project, SourceFile, SyntaxKind } from 'ts-simple-ast'
import * as R from 'ramda'

export class Ast {
  context: RootContext
  project: Project
  sourceFile: SourceFile

  constructor(context: RootContext, project: Project, filepath: string) {
    const {
      filesystem: { cwd },
    } = context

    this.context = context
    this.project = project
    this.sourceFile = project.getSourceFile(cwd(filepath).cwd())
  }

  addNamedImports(fromModule: string, namedImports: string[]) {
    const { sourceFile } = this

    let existingNamedImports = []
    const existings = sourceFile.getImportDeclaration(fromModule)
    if (existings) {
      existingNamedImports = existings.getNamedImports().map(ni => ni.getText())
      existings.remove()
    }

    sourceFile.addImportDeclaration({
      moduleSpecifier: fromModule,
      namedImports: R.uniq([...namedImports, ...existingNamedImports]).sort(),
    })
  }

  addSyntaxToMethod(className: string, methodName: string, syntax: string) {
    const syntaxList = this.sourceFile
      .getClass(className)
      .getMethod(methodName)
      .getBody()
      .getChildSyntaxList()

    if (syntaxList.getText().indexOf(syntax) < 0) {
      syntaxList.addChildText(syntax)
    }
  }

  wrapJsxTag(className: string, methodName: string, jsxWrapperName: string) {
    const { sourceFile } = this
    const method = sourceFile.getClass(className).getMethod(methodName)
    const methodReturn = method.getBody().getFirstDescendantByKind(SyntaxKind.ReturnStatement)

    const parents = []
    let target = ''
    methodReturn.forEachDescendant(c => {
      if (c.getKind() === SyntaxKind.JsxOpeningElement) {
        parents.push({
          open: c.getText(),
          close: `</${c.getChildAtIndex(1).getText()}>`,
        })
      } else if (c.getKind() === SyntaxKind.JsxSelfClosingElement) {
        target = c.getText()
      }
    })

    if (!parents.find(p => p.close === `</${jsxWrapperName}>`)) {
      parents.push({
        open: `<${jsxWrapperName}>`,
        close: `</${jsxWrapperName}>`,
      })
    }

    let results = ''
    parents.forEach(p => {
      results += p.open
    })
    results += target

    R.reverse(parents).forEach(p => {
      results += p.close
    })

    methodReturn.replaceWithText('return ' + results)
  }

  sortImports() {
    const { sourceFile } = this
    const declarations = sourceFile.getImportDeclarations()
    const imports = declarations.map(i => {
      const from = i.getModuleSpecifier().getLiteralValue()
      const order = from[0] !== '.' ? 0 : 1
      const impor = i.getImportClause().getText()
      const value = i.getStructure()
      i.remove()
      return {
        impor,
        from,
        order,
        value,
      }
    })

    const { ascend, prop, sortWith } = R
    const doSort = sortWith<any>([
      ascend(prop('order')),
      ascend(prop('from')),
      ascend(prop('impor')),
    ])
    const orderedImports = doSort(imports)

    sourceFile.addImportDeclarations(orderedImports.map(i => i.value))
  }

  save() {
    const { utils } = this.context
    utils.prettify(this.sourceFile.getFilePath(), this.sourceFile.getText())
  }
}