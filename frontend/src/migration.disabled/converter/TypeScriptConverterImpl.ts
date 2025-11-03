/**
 * TypeScript Converter Implementation
 * @module TypeScriptConverterImpl
 * @description Production-ready implementation of TypeScript conversion
 */

import * as ts from 'typescript';
import * as prettier from 'prettier';
import * as babel from '@babel/core';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import generate from '@babel/generator';

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

export interface TypeScriptInterface {
  name: string;
  code: string;
  properties: InterfaceProperty[];
  exported: boolean;
}

export interface InterfaceProperty {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  description: string | null;
}

export interface ConversionMetrics {
  linesConverted: number;
  typesInferred: number;
  interfacesGenerated: number;
  warningsCount: number;
  conversionTime: number;
  typesCoverage: number;
}

/**
 * Production TypeScript Converter Implementation
 */
export class TypeScriptConverterImpl {
  private options: ConversionOptions;
  private propTypesMap: Map<string, string> = new Map([
    ['PropTypes.string', 'string'],
    ['PropTypes.string.isRequired', 'string'],
    ['PropTypes.number', 'number'],
    ['PropTypes.number.isRequired', 'number'],
    ['PropTypes.bool', 'boolean'],
    ['PropTypes.bool.isRequired', 'boolean'],
    ['PropTypes.array', 'any[]'],
    ['PropTypes.array.isRequired', 'any[]'],
    ['PropTypes.object', 'Record<string, any>'],
    ['PropTypes.object.isRequired', 'Record<string, any>'],
    ['PropTypes.func', '(...args: any[]) => any'],
    ['PropTypes.func.isRequired', '(...args: any[]) => any'],
    ['PropTypes.node', 'React.ReactNode'],
    ['PropTypes.node.isRequired', 'React.ReactNode'],
    ['PropTypes.element', 'React.ReactElement'],
    ['PropTypes.element.isRequired', 'React.ReactElement'],
    ['PropTypes.any', 'any'],
    ['PropTypes.any.isRequired', 'any'],
    ['PropTypes.arrayOf', 'Array'],
    ['PropTypes.objectOf', 'Record'],
    ['PropTypes.oneOf', 'union'],
    ['PropTypes.oneOfType', 'union'],
    ['PropTypes.shape', 'object'],
    ['PropTypes.exact', 'object'],
    ['PropTypes.instanceOf', 'instanceof']
  ]);

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
  }

  /**
   * Main conversion method
   */
  public async convertComponent(
    jsCode: string,
    fileName: string = 'component.js'
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    const interfaces: TypeScriptInterface[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    let typesInferred = 0;

    try {
      // Parse JSX/JS code with Babel
      const ast = babel.parseSync(jsCode, {
        parserOpts: {
          sourceType: 'module',
          plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legacy']
        }
      });

      if (!ast) {
        throw new Error('Failed to parse JavaScript code');
      }

      // Extract PropTypes and convert to interface
      const propsInterface = this.extractPropsInterface(ast);
      if (propsInterface) {
        interfaces.push(propsInterface);
      }

      // Track state types for hooks
      const stateTypes = new Map<string, string>();
      const effectDeps = new Map<string, string[]>();

      // Transform AST
      traverse(ast, {
        // Convert imports
        ImportDeclaration: (path) => {
          if (this.options.modernizeImports) {
            const node = path.node;

            // Convert require to import
            if (node.source.value === 'prop-types') {
              // Remove PropTypes import in TypeScript
              path.remove();
              return;
            }

            // Add type imports where applicable
            if (this.options.useTypeImports && node.source.value === 'react') {
              const hasTypeImports = node.specifiers.some(spec =>
                spec.type === 'ImportSpecifier' &&
                ['Component', 'FC', 'ReactNode', 'ReactElement'].includes(spec.imported.name)
              );

              if (hasTypeImports) {
                // Split into type and value imports
                const typeSpecs = [];
                const valueSpecs = [];

                node.specifiers.forEach(spec => {
                  if (spec.type === 'ImportSpecifier') {
                    const name = spec.imported.name;
                    if (['FC', 'ReactNode', 'ReactElement', 'ComponentType'].includes(name)) {
                      typeSpecs.push(spec);
                    } else {
                      valueSpecs.push(spec);
                    }
                  } else {
                    valueSpecs.push(spec);
                  }
                });

                if (typeSpecs.length > 0) {
                  // Create type import
                  const typeImport = t.importDeclaration(
                    typeSpecs,
                    t.stringLiteral('react')
                  );
                  typeImport.importKind = 'type';
                  path.insertBefore(typeImport);
                }

                if (valueSpecs.length > 0) {
                  node.specifiers = valueSpecs;
                } else {
                  path.remove();
                }
              }
            }
          }
        },

        // Add types to function parameters
        FunctionDeclaration: (path) => {
          if (this.options.addTypeAnnotations) {
            const node = path.node;

            // Check if it's a React component
            const isComponent = node.id && /^[A-Z]/.test(node.id.name);

            if (isComponent && node.params.length > 0) {
              // Add props type annotation
              const propsParam = node.params[0];
              if (t.isIdentifier(propsParam) || t.isObjectPattern(propsParam)) {
                propsParam.typeAnnotation = t.tsTypeAnnotation(
                  t.tsTypeReference(
                    t.identifier(propsInterface ? propsInterface.name : 'Props')
                  )
                );
                typesInferred++;
              }
            }

            // Add return type
            if (!node.returnType && isComponent) {
              node.returnType = t.tsTypeAnnotation(
                t.tsTypeReference(
                  t.identifier('React.ReactElement')
                )
              );
              typesInferred++;
            }
          }
        },

        // Handle arrow functions (components)
        ArrowFunctionExpression: (path) => {
          if (this.options.addTypeAnnotations) {
            const parent = path.parent;
            const node = path.node;

            // Check if it's a React component
            const isComponent = t.isVariableDeclarator(parent) &&
                               parent.id &&
                               t.isIdentifier(parent.id) &&
                               /^[A-Z]/.test(parent.id.name);

            if (isComponent && node.params.length > 0) {
              // Add props type annotation
              const propsParam = node.params[0];
              if (t.isIdentifier(propsParam) || t.isObjectPattern(propsParam)) {
                propsParam.typeAnnotation = t.tsTypeAnnotation(
                  t.tsTypeReference(
                    t.identifier(propsInterface ? propsInterface.name : 'Props')
                  )
                );
                typesInferred++;
              }
            }

            // Add return type for components
            if (!node.returnType && isComponent) {
              node.returnType = t.tsTypeAnnotation(
                t.tsUnionType([
                  t.tsTypeReference(t.identifier('React.ReactElement')),
                  t.tsNullKeyword()
                ])
              );
              typesInferred++;
            }
          }
        },

        // Handle useState hooks
        CallExpression: (path) => {
          const node = path.node;

          // Check for useState
          if (t.isIdentifier(node.callee) && node.callee.name === 'useState') {
            const parent = path.parent;

            if (t.isVariableDeclarator(parent) && t.isArrayPattern(parent.id)) {
              const [stateVar, setterVar] = parent.id.elements;

              if (t.isIdentifier(stateVar)) {
                // Infer type from initial value
                const initialValue = node.arguments[0];
                let inferredType = 'any';

                if (initialValue) {
                  if (t.isStringLiteral(initialValue)) {
                    inferredType = 'string';
                  } else if (t.isNumericLiteral(initialValue)) {
                    inferredType = 'number';
                  } else if (t.isBooleanLiteral(initialValue)) {
                    inferredType = 'boolean';
                  } else if (t.isArrayExpression(initialValue)) {
                    inferredType = 'any[]';
                  } else if (t.isObjectExpression(initialValue)) {
                    inferredType = 'Record<string, any>';
                  } else if (t.isNullLiteral(initialValue)) {
                    inferredType = 'null';
                  }
                }

                stateTypes.set(stateVar.name, inferredType);

                // Add type parameter to useState
                node.typeParameters = t.tsTypeParameterInstantiation([
                  this.createTSType(inferredType)
                ]);
                typesInferred++;
              }
            }
          }

          // Check for useEffect dependencies
          if (t.isIdentifier(node.callee) && node.callee.name === 'useEffect') {
            if (node.arguments.length > 1) {
              const deps = node.arguments[1];
              if (t.isArrayExpression(deps)) {
                const depNames = deps.elements
                  .filter(el => t.isIdentifier(el))
                  .map(el => el.name);
                // Store for potential optimization warnings
                if (depNames.length > 0) {
                  warnings.push(`useEffect has ${depNames.length} dependencies: ${depNames.join(', ')}`);
                }
              }
            }
          }
        },

        // Convert PropTypes to TypeScript interface
        MemberExpression: (path) => {
          const node = path.node;

          if (t.isIdentifier(node.property) && node.property.name === 'propTypes') {
            // Remove PropTypes assignment
            const parent = path.parent;
            if (t.isAssignmentExpression(parent)) {
              const grandParent = path.parentPath.parent;
              if (t.isExpressionStatement(grandParent)) {
                path.parentPath.parentPath.remove();
              }
            }
          }

          // Handle defaultProps
          if (t.isIdentifier(node.property) && node.property.name === 'defaultProps') {
            const parent = path.parent;
            if (t.isAssignmentExpression(parent) && t.isObjectExpression(parent.right)) {
              // Convert to default parameters or default values in interface
              const defaults = new Map();
              parent.right.properties.forEach(prop => {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  defaults.set(prop.key.name, generate(prop.value).code);
                }
              });

              // Update interface with defaults
              if (propsInterface) {
                propsInterface.properties.forEach(prop => {
                  if (defaults.has(prop.name)) {
                    prop.defaultValue = defaults.get(prop.name);
                    prop.required = false;
                  }
                });
              }

              // Remove defaultProps assignment
              const grandParent = path.parentPath.parent;
              if (t.isExpressionStatement(grandParent)) {
                path.parentPath.parentPath.remove();
              }
            }
          }
        },

        // Add type annotations to variable declarations
        VariableDeclarator: (path) => {
          if (this.options.addTypeAnnotations && this.options.inferTypes) {
            const node = path.node;

            if (t.isIdentifier(node.id) && !node.id.typeAnnotation && node.init) {
              let inferredType = null;

              // Infer type from initialization
              if (t.isStringLiteral(node.init)) {
                inferredType = t.tsStringKeyword();
              } else if (t.isNumericLiteral(node.init)) {
                inferredType = t.tsNumberKeyword();
              } else if (t.isBooleanLiteral(node.init)) {
                inferredType = t.tsBooleanKeyword();
              } else if (t.isArrayExpression(node.init)) {
                inferredType = t.tsArrayType(t.tsAnyKeyword());
              } else if (t.isObjectExpression(node.init)) {
                inferredType = t.tsTypeReference(
                  t.identifier('Record'),
                  t.tsTypeParameterInstantiation([
                    t.tsStringKeyword(),
                    t.tsAnyKeyword()
                  ])
                );
              }

              if (inferredType) {
                node.id.typeAnnotation = t.tsTypeAnnotation(inferredType);
                typesInferred++;
              }
            }
          }
        }
      });

      // Generate code
      const output = generate(ast, {
        decoratorsBeforeExport: true,
        jsescOption: { minimal: true }
      });

      let finalCode = output.code;

      // Add interfaces at the top
      if (interfaces.length > 0) {
        const interfaceCode = interfaces.map(i => i.code).join('\n\n');

        // Find the position after imports
        const importEndMatch = finalCode.match(/^(import[\s\S]*?from\s+['"][^'"]+['"];?\s*\n)+/m);
        if (importEndMatch) {
          const importEnd = importEndMatch[0].length;
          finalCode =
            finalCode.slice(0, importEnd) +
            '\n' + interfaceCode + '\n\n' +
            finalCode.slice(importEnd);
        } else {
          finalCode = interfaceCode + '\n\n' + finalCode;
        }
      }

      // Format with Prettier
      try {
        finalCode = prettier.format(finalCode, {
          parser: 'typescript',
          semi: true,
          singleQuote: true,
          tabWidth: 2,
          trailingComma: 'es5',
          printWidth: 100
        });
      } catch (formatError) {
        warnings.push('Failed to format code with Prettier: ' + formatError.message);
      }

      // Calculate metrics
      const metrics: ConversionMetrics = {
        linesConverted: jsCode.split('\n').length,
        typesInferred,
        interfacesGenerated: interfaces.length,
        warningsCount: warnings.length,
        conversionTime: Date.now() - startTime,
        typesCoverage: this.calculateTypesCoverage(finalCode)
      };

      return {
        success: true,
        outputCode: finalCode,
        sourceFile: fileName,
        targetFile: fileName.replace(/\.jsx?$/, '.tsx'),
        interfaces,
        warnings,
        errors,
        metrics
      };

    } catch (error) {
      return {
        success: false,
        outputCode: '',
        sourceFile: fileName,
        targetFile: fileName.replace(/\.jsx?$/, '.tsx'),
        interfaces: [],
        warnings,
        errors: [`Conversion failed: ${(error as Error).message}`],
        metrics: {
          linesConverted: 0,
          typesInferred: 0,
          interfacesGenerated: 0,
          warningsCount: warnings.length,
          conversionTime: Date.now() - startTime,
          typesCoverage: 0
        }
      };
    }
  }

  /**
   * Extract props interface from PropTypes
   */
  private extractPropsInterface(ast: any): TypeScriptInterface | null {
    const properties: InterfaceProperty[] = [];
    let componentName = 'Component';

    traverse(ast, {
      // Find component name
      VariableDeclarator: (path) => {
        const node = path.node;
        if (t.isIdentifier(node.id) && /^[A-Z]/.test(node.id.name)) {
          // Check if it's likely a React component
          if (node.init && (t.isArrowFunctionExpression(node.init) || t.isFunctionExpression(node.init))) {
            componentName = node.id.name;
          }
        }
      },

      FunctionDeclaration: (path) => {
        const node = path.node;
        if (node.id && /^[A-Z]/.test(node.id.name)) {
          componentName = node.id.name;
        }
      },

      // Find PropTypes definition
      AssignmentExpression: (path) => {
        const node = path.node;

        if (t.isMemberExpression(node.left) &&
            t.isIdentifier(node.left.property) &&
            node.left.property.name === 'propTypes' &&
            t.isObjectExpression(node.right)) {

          // Extract prop types
          node.right.properties.forEach(prop => {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              const propName = prop.key.name;
              const propTypeInfo = this.extractPropType(prop.value);

              properties.push({
                name: propName,
                type: propTypeInfo.type,
                required: propTypeInfo.required,
                defaultValue: null,
                description: this.extractJSDocComment(prop)
              });
            }
          });
        }
      }
    });

    if (properties.length === 0) {
      return null;
    }

    const interfaceName = `${componentName}Props`;
    const interfaceCode = this.generateInterfaceCode(interfaceName, properties);

    return {
      name: interfaceName,
      code: interfaceCode,
      properties,
      exported: true
    };
  }

  /**
   * Extract prop type information
   */
  private extractPropType(node: any): { type: string; required: boolean } {
    let type = 'any';
    let required = false;

    if (t.isMemberExpression(node)) {
      const expression = generate(node).code;

      // Check for isRequired
      if (expression.endsWith('.isRequired')) {
        required = true;
      }

      // Map PropTypes to TypeScript types
      for (const [propType, tsType] of this.propTypesMap.entries()) {
        if (expression.includes(propType)) {
          type = tsType;
          break;
        }
      }

      // Handle special cases
      if (expression.includes('PropTypes.arrayOf')) {
        // Extract array element type
        type = 'any[]';
      } else if (expression.includes('PropTypes.oneOf')) {
        // Extract enum values
        type = 'string'; // Simplified - should extract actual values
      } else if (expression.includes('PropTypes.shape')) {
        // Extract object shape
        type = 'object'; // Simplified - should extract actual shape
      }
    }

    return { type, required };
  }

  /**
   * Generate TypeScript interface code
   */
  private generateInterfaceCode(name: string, properties: InterfaceProperty[]): string {
    const props = properties.map(prop => {
      const optional = prop.required ? '' : '?';
      const comment = prop.description ? `  /** ${prop.description} */\n  ` : '  ';
      const defaultComment = prop.defaultValue ? ` // default: ${prop.defaultValue}` : '';
      return `${comment}${prop.name}${optional}: ${prop.type};${defaultComment}`;
    }).join('\n');

    return `export interface ${name} {\n${props}\n}`;
  }

  /**
   * Create TypeScript type from string
   */
  private createTSType(typeString: string): any {
    switch (typeString) {
      case 'string':
        return t.tsStringKeyword();
      case 'number':
        return t.tsNumberKeyword();
      case 'boolean':
        return t.tsBooleanKeyword();
      case 'any':
        return t.tsAnyKeyword();
      case 'any[]':
        return t.tsArrayType(t.tsAnyKeyword());
      case 'null':
        return t.tsNullKeyword();
      case 'Record<string, any>':
        return t.tsTypeReference(
          t.identifier('Record'),
          t.tsTypeParameterInstantiation([
            t.tsStringKeyword(),
            t.tsAnyKeyword()
          ])
        );
      default:
        return t.tsAnyKeyword();
    }
  }

  /**
   * Extract JSDoc comment from node
   */
  private extractJSDocComment(node: any): string | null {
    // Simplified - should extract actual JSDoc comments
    return null;
  }

  /**
   * Calculate type coverage percentage
   */
  private calculateTypesCoverage(code: string): number {
    let typed = 0;
    let total = 0;

    // Count typed function parameters
    const funcMatches = code.matchAll(/\(([^)]*)\)\s*(:|=>)/g);
    for (const match of funcMatches) {
      const params = match[1].split(',');
      for (const param of params) {
        if (param.trim()) {
          total++;
          if (param.includes(':')) typed++;
        }
      }
    }

    // Count typed variables
    const varMatches = code.matchAll(/(const|let|var)\s+(\w+)\s*(:|\s*=)/g);
    for (const match of varMatches) {
      total++;
      if (match[3] === ':') typed++;
    }

    // Count typed return values
    const returnMatches = code.matchAll(/\)\s*:\s*[A-Z]/g);
    typed += Array.from(returnMatches).length;
    total += Array.from(returnMatches).length;

    return total > 0 ? Math.round((typed / total) * 100) : 0;
  }
}