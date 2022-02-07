import commander from 'commander';
import PackModule from './modules/pack';
import { name, version } from '../package.json';

const program = new commander.Command();

program.name(name);
program.version(version);

[PackModule].forEach((m) => m.register(program));

program.parse(process.argv);
