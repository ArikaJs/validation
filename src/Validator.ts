import { Rule } from './Rule';
import { ErrorBag } from './ErrorBag';
import { Required } from './Rules/Required';
import { Email } from './Rules/Email';
import { Min } from './Rules/Min';
import { Max } from './Rules/Max';
import { IsString } from './Rules/String';
import { IsNumber } from './Rules/Number';

export class Validator {
    private data: Record<string, any>;
    private rules: Record<string, string | Rule | (string | Rule)[]>;
    private errorBag: ErrorBag;
    private messages: Record<string, string> = {};
    private customRules: Map<string, Rule> = new Map();

    constructor(
        data: Record<string, any>,
        rules: Record<string, string | Rule | (string | Rule)[]> = {},
        messages: Record<string, string> = {}
    ) {
        this.data = data;
        this.rules = rules;
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

        for (const [attribute, rules] of Object.entries(this.rules)) {
            const ruleSet = this.parseRules(rules);
            const value = this.getValue(attribute);

            for (const rule of ruleSet) {
                // If value is null/undefined/empty and rule is NOT 'required', skip validation
                if (this.isEmpty(value) && !(rule instanceof Required)) {
                    continue;
                }

                const passes = await rule.validate(value, attribute);

                if (!passes) {
                    const message = this.formatMessage(rule.message(), attribute);
                    this.errorBag.add(attribute, message);

                    // Stop validating this attribute on first failure? 
                    // For now, let's collect all errors.
                }
            }
        }

        return this.errorBag.isEmpty();
    }

    public async fails(): Promise<boolean> {
        return !(await this.validate());
    }

    public errors(): Record<string, string[]> {
        return this.errorBag.all();
    }

    /**
     * Register a custom validation rule.
     */
    public extend(name: string, rule: Rule): void {
        this.customRules.set(name, rule);
    }

    private parseRules(rules: string | Rule | (string | Rule)[]): Rule[] {
        if (typeof rules === 'string') {
            return rules.split('|').map(r => this.createRuleFromString(r));
        }

        if (Array.isArray(rules)) {
            return rules.flatMap(r => {
                if (typeof r === 'string') {
                    return r.split('|').map(sub => this.createRuleFromString(sub));
                }
                return r;
            });
        }

        return [rules];
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

    private isEmpty(value: any): boolean {
        return value === null || value === undefined || value === '';
    }

    private formatMessage(message: string, attribute: string): string {
        return message.replace(':attribute', attribute);
    }
}
