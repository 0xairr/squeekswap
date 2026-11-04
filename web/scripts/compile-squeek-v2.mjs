import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import solc from 'solc'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(webRoot, '..')
const sourceName = 'squeek-src/SqueekSwapV2.sol'
const sourcePath = path.join(repoRoot, 'contracts', sourceName)
const mockSourceName = 'squeek-src/MockERC721V2.sol'
const mockSourcePath = path.join(repoRoot, 'contracts', mockSourceName)
const artifactDir = path.join(repoRoot, 'contracts', 'artifacts')
const artifactPath = path.join(artifactDir, 'SqueekSwapV2.json')
const mockArtifactPath = path.join(artifactDir, 'MockERC721V2.json')
const source = await readFile(sourcePath, 'utf8')
const mockSource = await readFile(mockSourcePath, 'utf8')

if (!solc.version().startsWith('0.8.28+')) {
  throw new Error(`Expected Solidity 0.8.28, received ${solc.version()}.`)
}

const settings = {
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  // Shanghai bytecode remains valid on Sepolia's newer fork and lets the
  // deterministic local EVM test execute the exact deployment artifact.
  evmVersion: 'shanghai',
  metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
  outputSelection: {
    '*': {
      '*': ['abi', 'metadata', 'evm.bytecode.object', 'evm.deployedBytecode.object'],
    },
  },
}
const input = {
  language: 'Solidity',
  sources: { [sourceName]: { content: source }, [mockSourceName]: { content: mockSource } },
  settings,
}
const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = output.errors ?? []
const fatal = errors.filter((entry) => entry.severity === 'error')
if (fatal.length > 0) throw new Error(fatal.map((entry) => entry.formattedMessage).join('\n'))

const contract = output.contracts?.[sourceName]?.SqueekSwapV2
const mock = output.contracts?.[mockSourceName]?.MockERC721V2
if (!contract?.evm?.bytecode?.object || !contract?.evm?.deployedBytecode?.object) {
  throw new Error('The SqueekSwapV2 compiler output is incomplete.')
}
if (!mock?.evm?.bytecode?.object || !mock?.evm?.deployedBytecode?.object) {
  throw new Error('The MockERC721V2 compiler output is incomplete.')
}

const artifact = {
  contractName: 'SqueekSwapV2',
  sourceName,
  sourceHash: `sha256:${createHash('sha256').update(source).digest('hex')}`,
  compiler: { version: solc.version() },
  settings,
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
  deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
  metadata: JSON.parse(contract.metadata),
}
const mockArtifact = {
  contractName: 'MockERC721V2',
  sourceName: mockSourceName,
  sourceHash: `sha256:${createHash('sha256').update(mockSource).digest('hex')}`,
  compiler: { version: solc.version() },
  settings,
  abi: mock.abi,
  bytecode: `0x${mock.evm.bytecode.object}`,
  deployedBytecode: `0x${mock.evm.deployedBytecode.object}`,
  metadata: JSON.parse(mock.metadata),
}

await mkdir(artifactDir, { recursive: true })
await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
await writeFile(mockArtifactPath, `${JSON.stringify(mockArtifact, null, 2)}\n`, 'utf8')
console.log(`Compiled SqueekSwapV2 with ${solc.version()}.`)
console.log(`Creation bytecode: ${contract.evm.bytecode.object.length / 2} bytes.`)
console.log(`Runtime bytecode: ${contract.evm.deployedBytecode.object.length / 2} bytes.`)
console.log(`Artifact: ${artifactPath}`)
console.log(`Mock artifact: ${mockArtifactPath}`)
