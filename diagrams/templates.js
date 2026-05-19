// Starter templates — pre-built diagrams for common kinds.
// Each template is a function that returns { name, summary, shapes,
// connectors } in the same shape Claude's diagram-spec produces, so
// applyClaudeDiagram() can render them on a new page.
//
// Keeping shapes / connectors abstract (no x/y) so auto-layout
// positions them readably.

(function () {
  'use strict';

  const TEMPLATES = {
    flowchart: {
      name: 'Flowchart starter',
      summary: 'Generic process flowchart',
      shapes: [
        { id: 'n1', stencil: 'bpmnStartEvent', text: 'Start' },
        { id: 'n2', stencil: 'flowProcess',    text: 'Step 1' },
        { id: 'n3', stencil: 'flowDecision',   text: 'Decision?' },
        { id: 'n4', stencil: 'flowProcess',    text: 'Step 2A' },
        { id: 'n5', stencil: 'flowProcess',    text: 'Step 2B' },
        { id: 'n6', stencil: 'bpmnEndEvent',   text: 'End' },
      ],
      connectors: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4', label: 'yes' },
        { from: 'n3', to: 'n5', label: 'no' },
        { from: 'n4', to: 'n6' },
        { from: 'n5', to: 'n6' },
      ],
    },
    orgChart: {
      name: 'Org chart starter',
      summary: 'Small team organization',
      shapes: [
        { id: 'd', stencil: 'orgExecutive', text: 'Director' },
        { id: 'm1', stencil: 'orgManager',  text: 'Manager A' },
        { id: 'm2', stencil: 'orgManager',  text: 'Manager B' },
        { id: 'p1', stencil: 'orgPosition', text: 'IC 1' },
        { id: 'p2', stencil: 'orgPosition', text: 'IC 2' },
        { id: 'p3', stencil: 'orgPosition', text: 'IC 3' },
      ],
      connectors: [
        { from: 'd',  to: 'm1' },
        { from: 'd',  to: 'm2' },
        { from: 'm1', to: 'p1' },
        { from: 'm1', to: 'p2' },
        { from: 'm2', to: 'p3' },
      ],
    },
    bpmn: {
      name: 'BPMN starter',
      summary: 'Simple BPMN process',
      shapes: [
        { id: 's', stencil: 'bpmnStartEvent', text: 'Receive request' },
        { id: 't1', stencil: 'bpmnTask',      text: 'Validate' },
        { id: 'gw', stencil: 'bpmnExclusive', text: 'Valid?' },
        { id: 't2', stencil: 'bpmnTask',      text: 'Process' },
        { id: 't3', stencil: 'bpmnTask',      text: 'Reject' },
        { id: 'e',  stencil: 'bpmnEndEvent',  text: 'Done' },
      ],
      connectors: [
        { from: 's',  to: 't1' },
        { from: 't1', to: 'gw' },
        { from: 'gw', to: 't2', label: 'yes' },
        { from: 'gw', to: 't3', label: 'no' },
        { from: 't2', to: 'e' },
        { from: 't3', to: 'e' },
      ],
    },
    network: {
      name: 'Network starter',
      summary: 'Small office network',
      shapes: [
        { id: 'cloud',  stencil: 'netCloud',       text: 'Internet' },
        { id: 'fw',     stencil: 'netFirewall',    text: 'Firewall' },
        { id: 'rt',     stencil: 'netRouter',      text: 'Router' },
        { id: 'sw',     stencil: 'netSwitch',      text: 'Switch' },
        { id: 'ws1',    stencil: 'netWorkstation', text: 'PC 1' },
        { id: 'ws2',    stencil: 'netWorkstation', text: 'PC 2' },
        { id: 'pr',     stencil: 'netPrinter',     text: 'Printer' },
      ],
      connectors: [
        { from: 'cloud', to: 'fw' },
        { from: 'fw',    to: 'rt' },
        { from: 'rt',    to: 'sw' },
        { from: 'sw',    to: 'ws1' },
        { from: 'sw',    to: 'ws2' },
        { from: 'sw',    to: 'pr' },
      ],
    },
    mindmap: {
      name: 'Mind map starter',
      summary: 'Central topic with branches',
      shapes: [
        { id: 'c',  stencil: 'mmCentral',    text: 'Central topic' },
        { id: 'b1', stencil: 'mmBranch',     text: 'Branch 1' },
        { id: 'b2', stencil: 'mmBranch',     text: 'Branch 2' },
        { id: 'b3', stencil: 'mmBranch',     text: 'Branch 3' },
        { id: 'b4', stencil: 'mmBranch',     text: 'Branch 4' },
      ],
      connectors: [
        { from: 'c', to: 'b1' },
        { from: 'c', to: 'b2' },
        { from: 'c', to: 'b3' },
        { from: 'c', to: 'b4' },
      ],
    },
    umlClass: {
      name: 'UML class diagram starter',
      summary: 'Two classes with association',
      shapes: [
        { id: 'a', stencil: 'umlClass', text: 'ClassA\n— field: type\n+ method()' },
        { id: 'b', stencil: 'umlClass', text: 'ClassB\n— field: type\n+ method()' },
      ],
      connectors: [
        { from: 'a', to: 'b', label: 'uses' },
      ],
    },
    wireframe: {
      name: 'Wireframe starter',
      summary: 'Simple page layout',
      shapes: [
        { id: 'nav',  stencil: 'uiNav',       text: 'Nav bar' },
        { id: 'hdr',  stencil: 'uiLabel',     text: 'Heading' },
        { id: 'body', stencil: 'uiContainer', text: 'Body content' },
        { id: 'btn',  stencil: 'uiButton',    text: 'Submit' },
      ],
      connectors: [],
    },
    floorPlan: {
      name: 'Floor plan starter',
      summary: 'Single room with door + window',
      shapes: [
        { id: 'room',    stencil: 'fpRoom',   text: 'Room' },
        { id: 'door',    stencil: 'fpDoor',   text: '' },
        { id: 'window',  stencil: 'fpWindow', text: '' },
        { id: 'desk',    stencil: 'fpDesk',   text: 'Desk' },
        { id: 'chair',   stencil: 'fpChair',  text: '' },
      ],
      connectors: [],
    },
  };

  window.RodmanVisionTemplates = TEMPLATES;
})();
