import { Rule } from './Rule';
import { ErrorBag } from './ErrorBag';
import { Required } from './Rules/Required';
import { Email } from './Rules/Email';
import { Min } from './Rules/Min';
import { Max } from './Rules/Max';
import { IsString } from './Rules/String';
import { IsNumber } from './Rules/Number';
import { RequiredIf } from './Rules/RequiredIf';

export class Validator {
    private data: Record<string, any>;
    private initialRules: Record<string, string | Rule | (string | Rule)[]>;
    private errorBag: ErrorBag;
    private messages: Record<string, string> = {};
    private customRules: Map<string, Rule> = new Map();
    private validatedData: Record<string, any> = {};

    constructor(
        data: Record<string, any>,
        rules: Record<string, string | Rule | (string | Rule)[]> = {},
        messages: Record<string, string> = {}
    ) {
        this.data = data;
        this.initialRules = rules;
        this.messages = messages;
        this.errorBag = new ErrorBag();

        // Register default rules
        this.customRules.set('required', new Required());
        this.customRules.set('email', new Email());
        this.customRules.set('string', new IsString());
        this.customRules.set('number', new IsNumber());
    }

    /**
     * Determine if the data passes the validation rules.
     */
    public async validate(): Promise<boolean> {
        this.errorBag = new ErrorBag();
        this.validatedData = {};

        const expandedRules = this.expandRules(this.initialRules);

        for (const [attribute, rules] of Object.entries(expandedRules)) {
            const ruleSet = this.parseRules(rules);
            const value = this.getValue(attribute);

            const isNullable = ruleSet.some(r => (r as any).name === 'nullable');
            const shouldBail = ruleSet.some(r => (r as any).name === 'bail');

            // Handle nullable
            if (isNullable && (value === null || value === undefined)) {
                this.setValidatedValue(attribute, value);
                continue;
            }

            let failed = false;
            for (const rule of ruleSet) {
                // Skip pseudo-rules
                if ((rule as any).name === 'nullable' || (rule as any).name === 'bail') {
                    continue;
                }

                // If value is null/undefined/empty and rule is NOT 'required' (or similar), skip validation
                if (this.isEmpty(value) && !this.isRequirementRule(rule)) {
                    continue;
                }

                const passes = await rule.validate(value, attribute);

                if (!passes) {
                    const message = this.formatMessage(rule.message(), attribute);
                    this.errorBag.add(attribute, message);
                    failed = true;

                    if (shouldBail) {
                        break;
                    }
                }
            }

            if (!failed) {
                this.setValidatedValue(attribute, value);
            }
        }

        return this.errorBag.isEmpty();
    }

    private isRequirementRule(rule: Rule): boolean {
        return rule instanceof Required || rule instanceof RequiredIf;
    }

    public async fails(): Promise<boolean> {
        return !(await this.validate());
    }

    public errors(): Record<string, string[]> {
        return this.errorBag.all();
    }

    public validated(): Record<string, any> {
        return this.validatedData;
    }

    /**
     * Register a custom validation rule.
     */
    public extend(name: string, rule: Rule): void {
        this.customRules.set(name, rule);
    }

    private parseRules(rules: string | Rule | (string | Rule)[]): Rule[] {
        let parsed: (string | Rule)[];

        if (typeof rules === 'string') {
            parsed = rules.split('|');
        } else if (Array.isArray(rules)) {
            parsed = rules;
        } else {
            parsed = [rules];
        }

        return parsed.flatMap(r => {
            if (typeof r === 'string') {
                return r.split('|').map(sub => this.createRuleFromString(sub));
            }
            return r;
        });
    }

    private createRuleFromString(ruleString: string): Rule {
        const [fullRule, ...rest] = ruleString.split(':');
        const name = fullRule.trim();
        const params = rest.length > 0 ? rest.join(':') : '';
        const parameters = params ? params.split(',') : [];

        switch (name) {
            case 'min':
                return new Min(Number(parameters[0]));
            case 'max':
                return new Max(Number(parameters[0]));
            case 'required_if':
                return new RequiredIf(parameters[0], parameters[1], this.data);
            case 'nullable':
            case 'bail':
                // Return a dummy rule that we'll handle in the main loop
                return {
                    name,
                    validate: async () => true,
                    message: () => ''
                } as any;
            default:
                const rule = this.customRules.get(name);
                if (!rule) {
                    throw new Error(`Validation rule '${name}' not found.`);
                }
                return rule;
        }
    }

    private getValue(key: string): any {
        return key.split('.').reduce((o, i) => (o ? o[i] : undefined), this.data);
    }

    private setValidatedValue(path: string, value: any): void {
        const keys = path.split('.');
        let current = this.validatedData;

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (i === keys.length - 1) {
                current[key] = value;
            } else {
                current[key] = current[key] || {};
                current = current[key];
            }
        }
    }

    private isEmpty(value: any): boolean {
        return value === null || value === undefined || value === '';
    }

    private formatMessage(message: string, attribute: string): string {
        return message.replace(':attribute', attribute);
    }

    private expandRules(rules: Record<string, any>): Record<string, any> {
        const expanded: Record<string, any> = {};

        for (const [key, rule] of Object.entries(rules)) {
            if (key.includes('*')) {
                this.expandWildcards(key, rule, this.data, expanded);
            } else {
                expanded[key] = rule;
            }
        }

        return expanded;
    }

    private expandWildcards(path: string, rule: any, data: any, expanded: Record<string, any>): void {
        const parts = path.split('.');
        const starIndex = parts.indexOf('*');

        if (starIndex === -1) {
            expanded[path] = rule;
            return;
        }

        const before = parts.slice(0, starIndex).join('.');
        const after = parts.slice(starIndex + 1).join('.');
        const collection = this.getValue(before);

        if (Array.isArray(collection)) {
            for (let i = 0; i < collection.length; i++) {
                const subPath = after ? `${before}.${i}.${after}` : `${before}.${i}`;
                if (subPath.includes('*')) {
                    this.expandWildcards(subPath, rule, data, expanded);
                } else {
                    expanded[subPath] = rule;
                }
            }
        }
    }
}
