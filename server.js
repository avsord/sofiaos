'use strict';
// Compatibilidade: mesmo quem iniciar o arquivo antigo usa o único servidor correto.
require('./src/server').startServer().catch(()=>{console.error('Não foi possível iniciar a Sofia. Execute DIAGNOSTICO_SOFIA.cmd.');process.exitCode=1;});
