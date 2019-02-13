import {
  workspace,
  window,
  DocumentRangeFormattingEditProvider,
  DocumentFormattingEditProvider,
  Range,
  TextDocument,
  FormattingOptions,
  CancellationToken,
  TextEdit,
  Selection,
  Position
} from 'vscode'

const prettify = require('prettier-eslint')
const standard = require('standard')
const eslintConfig = require('./eslint-config')

type ArrowParensOption = 'avoid' | 'always'
type ParserOption = 'babylon' | 'flow'
type TrailingCommaOption = 'none' | 'es5' | 'all'
type ShowAction = 'Show'

interface PrettierConfig {
  arrowParens: ArrowParensOption
  printWidth: number
  trailingComma: TrailingCommaOption
  bracketSpacing: boolean
  jsxBracketSameLine: boolean
  parser: ParserOption
}

function format(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const config: PrettierConfig = workspace.getConfiguration('prettier') as any
    const pretty = prettify({
      text,
      prettierLast: true,
      eslintConfig,
      prettierOptions: {
        arrowParens: config.arrowParens || 'avoid',
        printWidth: config.printWidth,
        singleQuote: true,
        trailingComma: config.trailingComma || 'es5',
        bracketSpacing: config.bracketSpacing,
        jsxBracketSameLine: config.jsxBracketSameLine,
        parser: config.parser || 'babylon',
        semi: false
      }
    })

    standard.lintText(
      pretty,
      { fix: true, parser: 'babel-eslint' },
      (err, result) => {
        if (err) return reportError('1', err)
        const output = result.results[0].output || pretty
        if (typeof output === 'string') return resolve(output)
        if (result.results[0].errorCount) return reportError('2', result)
        return reportError('3', result)
      }
    )
    function reportError(num, obj) {
      // console.log(num, JSON.stringify(obj, null, 2))
      standard.lintText(
        text,
        { fix: true, parser: 'babel-eslint' },
        (err, result) => {
          if (err) return reject(err)
          if (result.results[0].errorCount) {
            // console.log(JSON.stringify(result, null, 2))
            return reject({
              message: result.results[0].messages[0].message,
              loc: {
                line: result.results[0].messages[0].line,
                column: result.results[0].messages[0].column
              }
            })
          }
          if (typeof result.results[0].output !== 'string') {
            // console.log(JSON.stringify(result, null, 2))
            return reject(new Error('Expected a string back from standard'))
          }
        }
      )
    }
  })
}

function fullDocumentRange(document: TextDocument): Range {
  const lastLineId = document.lineCount - 1
  return new Range(0, 0, lastLineId, document.lineAt(lastLineId).text.length)
}

export default class PrettierEditProvider
  implements
  DocumentRangeFormattingEditProvider,
  DocumentFormattingEditProvider {
  provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]> {
    return format(document.getText(range))
      .then(newText => [TextEdit.replace(range, newText)])
      .catch(e => {
        let errorPosition
        if (e.loc) {
          let charPos = e.loc.column
          if (e.loc.line === 1) charPos = range.start.character + e.loc.column
          errorPosition = new Position(
            e.loc.line - 1 + range.start.line,
            charPos
          )
        }
        handleError(document, e.message, errorPosition)
        return []
      })
  }

  provideDocumentFormattingEdits(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]> {
    return format(document.getText())
      .then(newText => [TextEdit.replace(fullDocumentRange(document), newText)])
      .catch(e => {
        let errorPosition
        if (e.loc) errorPosition = new Position(e.loc.line - 1, e.loc.column)
        handleError(document, e.message, errorPosition)
        return []
      })
  }
}

function handleError(
  document: TextDocument,
  message: string,
  errorPosition: Position
) {
  if (!errorPosition) return window.showErrorMessage(message)
  window
    .showErrorMessage(message, 'Show')
    .then(function onAction(action?: ShowAction) {
      if (action === 'Show') {
        const rangeError = new Range(errorPosition, errorPosition)
        window.showTextDocument(document).then(editor => {
          editor.selection = new Selection(rangeError.start, rangeError.end)
          editor.revealRange(rangeError)
        })
      }
    })
}
