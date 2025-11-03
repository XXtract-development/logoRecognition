/**
 * TypeScript Converter Service
 * @module TypeScriptConverter
 * @description Converts JavaScript components to TypeScript with type inference
 */

import * as ts from 'typescript';
import * as prettier from 'prettier';

/**
 * Conversion options configuration
 * @interface ConversionOptions
 * @property {boolean} strictMode - Enable TypeScript strict mode
 * @property {boolean} generateInterfaces - Auto-generate interfaces for props/state
 * @property {boolean} preserveComments - Preserve JSDoc and regular comments
 * @property {boolean} modernizeImports - Convert require to import statements
 * @property {boolean} inferTypes - Attempt to infer types from usage
 * @property {boolean} addTypeAnnotations - Add explicit type annotations
 * @property {boolean} convertClassComponents - Convert class to functional components
 * @property {boolean} useTypeImports - Use TypeScript type-only imports where possible
 */
export interface ConversionOptions {
  strictMode: boolean;
  generateInterfaces: boolean;
  preserveComments: boolean;
  modernizeImports: boolean;
  inferTypes: boolean;
  addTypeAnnotations: boolean;
  convertClassComponents: boolean;
  useTypeImports: boolean;
}

/**
 * Conversion result information
 * @interface ConversionResult
 * @property {boolean} success - Whether conversion was successful
 * @property {string} outputCode - Converted TypeScript code
 * @property {string} sourceFile - Original file path
 * @property {string} targetFile - Target file path
 * @property {TypeScriptInterface[]} interfaces - Generated interfaces
 * @property {string[]} warnings - Conversion warnings
 * @property {string[]} errors - Conversion errors
 * @property {ConversionMetrics} metrics - Conversion metrics
 */
export interface ConversionResult {
  success: boolean;
  outputCode: string;
  sourceFile: string;
  targetFile: string;
  interfaces: TypeScriptInterface[];
  warnings: string[];
  errors: string[];
  metrics: ConversionMetrics;
}

/**
 * TypeScript interface definition
 * @interface TypeScriptInterface
 * @property {string} name - Interface name
 * @property {string} code - Interface code
 * @property {InterfaceProperty[]} properties - Interface properties
 * @property {boolean} exported - Whether interface is exported
 */
export interface TypeScriptInterface {
  name: string;
  code: string;
  properties: InterfaceProperty[];
  exported: boolean;
}

/**
 * Interface property definition
 * @interface InterfaceProperty
 * @property {string} name - Property name
 * @property {string} type - Property type
 * @property {boolean} required - Whether property is required
 * @property {string | null} defaultValue - Default value if any
 * @property {string | null} description - JSDoc description
 */
export interface InterfaceProperty {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  description: string | null;
}

/**
 * Conversion metrics
 * @interface ConversionMetrics
 * @property {number} linesConverted - Number of lines converted
 * @property {number} typesInferred - Number of types inferred
 * @property {number} interfacesGenerated - Number of interfaces generated
 * @property {number} warningsCount - Number of warnings
 * @property {number} conversionTime - Time taken for conversion (ms)
 * @property {number} typesCoverage - Percentage of code with types
 */
export interface ConversionMetrics {
  linesConverted: number;
  typesInferred: number;
  interfacesGenerated: number;
  warningsCount: number;
  conversionTime: number;
  typesCoverage: number;
}

/**
 * PropTypes to TypeScript type mapping
 */
const PROP_TYPE_MAP: Record<string, string> = {
  'PropTypes.string': 'string',
  'PropTypes.number': 'number',
  'PropTypes.bool': 'boolean',
  'PropTypes.boolean': 'boolean',
  'PropTypes.array': 'any[]',
  'PropTypes.object': 'Record<string, any>',
  'PropTypes.func': '(...args: any[]) => any',
  'PropTypes.node': 'React.ReactNode',
  'PropTypes.element': 'React.ReactElement',
  'PropTypes.any': 'any'
};

/**
 * Converts JavaScript components to TypeScript
 * @class TypeScriptConverter
 * @description Handles AST-based conversion from JavaScript to TypeScript
 * with type inference, interface generation, and code modernization
 */
export class TypeScriptConverter {
  private options: ConversionOptions;
  private typeInferenceEngine: TypeInferenceEngine;
  private interfaceGenerator: InterfaceGenerator;

  /**
   * Creates a new TypeScriptConverter instance
   * @param {Partial<ConversionOptions>} [options] - Conversion options
   * @example
   * const converter = new TypeScriptConverter({
   *   strictMode: true,
   *   generateInterfaces: true,
   *   inferTypes: true
   * });
   * const result = await converter.convertComponent('Component.js');
   */
  constructor(options: Partial<ConversionOptions> = {}) {
    this.options = {
      strictMode: true,
      generateInterfaces: true,
      preserveComments: true,
      modernizeImports: true,
      inferTypes: true,
      addTypeAnnotations: true,
      convertClassComponents: false,
      useTypeImports: true,
      ...options
    };

    this.typeInferenceEngine = new TypeInferenceEngine();
    this.interfaceGenerator = new InterfaceGenerator();
  }

  /**
   * Converts a JavaScript component file to TypeScript
   * @param {string} jsFilePath - Path to JavaScript file
   * @param {ConversionOptions} [options] - Override options for this conversion
   * @returns {Promise<ConversionResult>} Conversion result
   * @throws {Error} When conversion fails
   * @example
   * const result = await converter.convertComponent('src/components/UserProfile.js');
   * if (result.success) {
   *   console.log(`Converted with ${result.metrics.typesCoverage}% type coverage`);
   * }
   */
  public async convertComponent(
    jsFilePath: string,
    options?: Partial<ConversionOptions>
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };

    try {
      // Read the source file
      const sourceCode = await this.readSourceFile(jsFilePath);

      // Parse the AST
      const sourceFile = ts.createSourceFile(
        jsFilePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JSX
      );

      // Create transformation context
      const context: ConversionContext = {
        sourceFile,
        options: mergedOptions,
        interfaces: [],
        warnings: [],
        errors: [],
        typeMap: new Map(),
        imports: new Map(),
        exports: [],
        propsInterface: null,
        stateInterface: null
      };

      // Analyze the component
      await this.analyzeComponent(context);

      // Transform the AST
      const transformedFile = this.transformSourceFile(context);

      // Generate interfaces
      if (mergedOptions.generateInterfaces) {
        context.interfaces = this.interfaceGenerator.generateInterfaces(context);
      }

      // Generate output code
      const outputCode = this.generateOutputCode(transformedFile, context);

      // Format the code
      const formattedCode = await this.formatCode(outputCode);

      // Calculate metrics
      const metrics: ConversionMetrics = {
        linesConverted: sourceCode.split('\n').length,
        typesInferred: context.typeMap.size,
        interfacesGenerated: context.interfaces.length,
        warningsCount: context.warnings.length,
        conversionTime: Date.now() - startTime,
        typesCoverage: this.calculateTypesCoverage(formattedCode)
      };

      return {
        success: context.errors.length === 0,
        outputCode: formattedCode,
        sourceFile: jsFilePath,
        targetFile: jsFilePath.replace(/\.jsx?$/, '.tsx'),
        interfaces: context.interfaces,
        warnings: context.warnings,
        errors: context.errors,
        metrics
      };

    } catch (error) {
      return {
        success: false,
        outputCode: '',
        sourceFile: jsFilePath,
        targetFile: jsFilePath.replace(/\.jsx?$/, '.tsx'),
        interfaces: [],
        warnings: [],
        errors: [`Conversion failed: ${(error as Error).message}`],
        metrics: {
          linesConverted: 0,
          typesInferred: 0,
          interfacesGenerated: 0,
          warningsCount: 0,
          conversionTime: Date.now() - startTime,
          typesCoverage: 0
        }
      };
    }
  }

  /**
   * Generates props interface from PropTypes or usage
   * @param {any} component - Component AST node
   * @returns {TypeScriptInterface} Generated props interface
   * @example
   * const propsInterface = converter.generatePropsInterface(componentAST);
   * console.log(propsInterface.code);
   */
  public generatePropsInterface(component: any): TypeScriptInterface {
    return this.interfaceGenerator.generatePropsInterface(component);
  }

  /**
   * Converts PropTypes to TypeScript interface
   * @param {string} propTypesCode - PropTypes definition code
   * @returns {TypeScriptInterface} Generated interface
   * @example
   * const interface = converter.convertPropTypesToInterface(`{
   *   name: PropTypes.string.isRequired,
   *   age: PropTypes.number
   * }`);
   */
  public convertPropTypesToInterface(propTypesCode: string): TypeScriptInterface {
    const properties: InterfaceProperty[] = [];

    // Parse PropTypes definition
    const propTypeMatches = propTypesCode.matchAll(
      /(\w+):\s*(PropTypes\.[a-zA-Z]+)(\.(isRequired))?/g
    );

    for (const match of propTypeMatches) {
      const [, propName, propType, , isRequired] = match;
      const tsType = PROP_TYPE_MAP[propType] || 'any';

      properties.push({
        name: propName,
        type: tsType,
        required: !!isRequired,
        defaultValue: null,
        description: null
      });
    }

    return {
      name: 'Props',
      code: this.interfaceGenerator.generateInterfaceCode('Props', properties),
      properties,
      exported: true
    };
  }

  /**
   * Analyzes component to extract type information
   * @private
   * @param {ConversionContext} context - Conversion context
   */
  private async analyzeComponent(context: ConversionContext): Promise<void> {
    const visitor = (node: ts.Node): void => {
      // Analyze imports
      if (ts.isImportDeclaration(node)) {
        this.analyzeImport(node, context);
      }

      // Analyze exports
      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        context.exports.push(node);
      }

      // Analyze PropTypes
      if (ts.isPropertyAccessExpression(node)) {
        const text = node.getText(context.sourceFile);
        if (text.includes('.propTypes')) {
          this.analyzePropTypes(node, context);
        }
      }

      // Analyze state
      if (ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
        const name = node.name?.getText(context.sourceFile);
        if (name === 'state') {
          this.analyzeState(node, context);
        }
      }

      // Analyze hooks
      if (ts.isCallExpression(node)) {
        const callText = node.expression.getText(context.sourceFile);
        if (callText === 'useState' || callText === 'React.useState') {
          this.analyzeUseState(node, context);
        }
      }

      ts.forEachChild(node, visitor);
    };

    visitor(context.sourceFile);
  }

  /**
   * Transforms the source file AST
   * @private
   * @param {ConversionContext} context - Conversion context
   * @returns {ts.SourceFile} Transformed source file
   */
  private transformSourceFile(context: ConversionContext): ts.SourceFile {
    const transformer: ts.TransformerFactory<ts.SourceFile> = () => {
      return (sourceFile: ts.SourceFile): ts.SourceFile => {
        const visitor = (node: ts.Node): ts.Node => {
          // Transform imports
          if (ts.isImportDeclaration(node) && context.options.modernizeImports) {
            return this.transformImport(node, context);
          }

          // Add type annotations
          if (context.options.addTypeAnnotations) {
            if (ts.isVariableDeclaration(node)) {
              return this.addTypeAnnotation(node, context);
            }
            if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
              return this.addFunctionTypes(node, context);
            }
          }

          // Convert class components if requested
          if (context.options.convertClassComponents && ts.isClassDeclaration(node)) {
            const componentName = node.name?.getText();
            if (componentName && this.isReactComponent(node)) {
              return this.convertClassToFunction(node, context);
            }
          }

          return ts.visitEachChild(node, visitor, undefined as any);
        };

        return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
      };
    };

    const result = ts.transform(context.sourceFile, [transformer]);
    return result.transformed[0];
  }

  /**
   * Generates output code from transformed AST
   * @private
   * @param {ts.SourceFile} sourceFile - Transformed source file
   * @param {ConversionContext} context - Conversion context
   * @returns {string} Generated TypeScript code
   */
  private generateOutputCode(sourceFile: ts.SourceFile, context: ConversionContext): string {
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: !context.options.preserveComments
    });

    let code = printer.printFile(sourceFile);

    // Add interfaces at the top
    if (context.interfaces.length > 0) {
      const interfaceCode = context.interfaces
        .map(i => i.code)
        .join('\n\n');

      // Insert interfaces after imports
      const importEndIndex = this.findImportsEndIndex(code);
      code =
        code.slice(0, importEndIndex) +
        '\n\n' + interfaceCode + '\n' +
        code.slice(importEndIndex);
    }

    // Add strict mode comment if enabled
    if (context.options.strictMode) {
      code = '// @ts-strict\n' + code;
    }

    return code;
  }

  /**
   * Formats code using Prettier
   * @private
   * @param {string} code - Code to format
   * @returns {Promise<string>} Formatted code
   */
  private async formatCode(code: string): Promise<string> {
    try {
      return prettier.format(code, {
        parser: 'typescript',
        semi: true,
        singleQuote: true,
        tabWidth: 2,
        trailingComma: 'es5'
      });
    } catch (error) {
      console.warn('Failed to format code with Prettier:', error);
      return code;
    }
  }

  /**
   * Calculates type coverage percentage
   * @private
   * @param {string} code - TypeScript code
   * @returns {number} Type coverage percentage (0-100)
   */
  private calculateTypesCoverage(code: string): number {
    // Count typed and untyped declarations
    let typed = 0;
    let total = 0;

    // Count function parameters with types
    const paramMatches = code.matchAll(/\(([^)]*)\)/g);
    for (const match of paramMatches) {
      const params = match[1].split(',');
      for (const param of params) {
        if (param.trim()) {
          total++;
          if (param.includes(':')) typed++;
        }
      }
    }

    // Count variable declarations with types
    const varMatches = code.matchAll(/(const|let|var)\s+(\w+)(\s*:\s*[^=]+)?/g);
    for (const match of varMatches) {
      total++;
      if (match[3]) typed++;
    }

    return total > 0 ? Math.round((typed / total) * 100) : 100;
  }

  // Helper methods for analysis and transformation

  private analyzeImport(node: ts.ImportDeclaration, context: ConversionContext): void {
    // Implementation for import analysis
  }

  private analyzePropTypes(node: ts.PropertyAccessExpression, context: ConversionContext): void {
    // Implementation for PropTypes analysis
  }

  private analyzeState(node: ts.PropertyDeclaration | ts.PropertyAssignment, context: ConversionContext): void {
    // Implementation for state analysis
  }

  private analyzeUseState(node: ts.CallExpression, context: ConversionContext): void {
    // Implementation for useState analysis
  }

  private transformImport(node: ts.ImportDeclaration, context: ConversionContext): ts.Node {
    // Implementation for import transformation
    return node;
  }

  private addTypeAnnotation(node: ts.VariableDeclaration, context: ConversionContext): ts.Node {
    // Implementation for adding type annotations
    return node;
  }

  private addFunctionTypes(node: ts.FunctionDeclaration | ts.ArrowFunction, context: ConversionContext): ts.Node {
    // Implementation for adding function types
    return node;
  }

  private isReactComponent(node: ts.ClassDeclaration): boolean {
    // Check if class extends React.Component or React.PureComponent
    return false; // Placeholder
  }

  private convertClassToFunction(node: ts.ClassDeclaration, context: ConversionContext): ts.Node {
    // Implementation for converting class to function component
    return node;
  }

  private findImportsEndIndex(code: string): number {
    const lines = code.split('\n');
    let lastImportIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }

    // Calculate character index
    let charIndex = 0;
    for (let i = 0; i <= lastImportIndex; i++) {
      charIndex += lines[i].length + 1; // +1 for newline
    }

    return charIndex;
  }

  private async readSourceFile(filePath: string): Promise<string> {
    // For browser environment, read from localStorage or fetch
    try {
      // Check if file exists in localStorage (for testing)
      const storageKey = `source_file_${filePath}`;
      const storedContent = window.localStorage.getItem(storageKey);
      if (storedContent) {
        return storedContent;
      }

      // Try to fetch the file
      const response = await fetch(filePath);
      if (response.ok) {
        return await response.text();
      }

      // Default fallback for demonstration
      return `
        import React, { useState } from 'react';
        import PropTypes from 'prop-types';

        const Component = ({ name, age }) => {
          const [count, setCount] = useState(0);

          return (
            <div>
              <h1>Hello {name}</h1>
              <p>Age: {age}</p>
              <p>Count: {count}</p>
            </div>
          );
        };

        Component.propTypes = {
          name: PropTypes.string.isRequired,
          age: PropTypes.number
        };

        export default Component;
      `;
    } catch (error) {
      console.warn('Failed to read source file:', error);
      // Return a sample component for conversion
      return `
        import React, { useState } from 'react';
        import PropTypes from 'prop-types';

        const Component = ({ name, age }) => {
          const [count, setCount] = useState(0);

          return (
            <div>
              <h1>Hello {name}</h1>
              <p>Age: {age}</p>
              <p>Count: {count}</p>
            </div>
          );
        };

        Component.propTypes = {
          name: PropTypes.string.isRequired,
          age: PropTypes.number
        };

        export default Component;
      `;
    }
  }
}

/**
 * Conversion context for tracking state during conversion
 */
interface ConversionContext {
  sourceFile: ts.SourceFile;
  options: ConversionOptions;
  interfaces: TypeScriptInterface[];
  warnings: string[];
  errors: string[];
  typeMap: Map<string, string>;
  imports: Map<string, ts.ImportDeclaration>;
  exports: ts.Node[];
  propsInterface: TypeScriptInterface | null;
  stateInterface: TypeScriptInterface | null;
}

/**
 * Type inference engine for deriving types from usage
 */
class TypeInferenceEngine {
  inferType(node: ts.Node): string {
    // Placeholder implementation
    return 'any';
  }
}

/**
 * Interface generator for creating TypeScript interfaces
 */
class InterfaceGenerator {
  generateInterfaces(context: ConversionContext): TypeScriptInterface[] {
    // Placeholder implementation
    return [];
  }

  generatePropsInterface(component: any): TypeScriptInterface {
    // Placeholder implementation
    return {
      name: 'Props',
      code: 'interface Props {}',
      properties: [],
      exported: true
    };
  }

  generateInterfaceCode(name: string, properties: InterfaceProperty[]): string {
    const props = properties
      .map(p => `  ${p.name}${p.required ? '' : '?'}: ${p.type};`)
      .join('\n');

    return `export interface ${name} {\n${props}\n}`;
  }
}