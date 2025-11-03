# 10. Dependencies

## 10.1 External Dependencies
- Cloud infrastructure (AWS/GCP/Azure)
- GPU resources for training
- S3-compatible storage
- SSL certificates
- Figma licenses voor design team
- Design assets (icons, images, fonts)

## 10.2 Internal Dependencies
- IT approval for infrastructure
- Security review
- Data governance approval
- Budget allocation
- Brand guidelines van marketing
- UX Designer resource (part-time, 2-3 dagen/week)

## 10.3 Design & UX Dependencies

### Team Resources
| Role | Allocation | Period | Responsibility |
|------|------------|--------|----------------|
| UX Designer | 2-3 dagen/week | Week 1-20 | Design system, wireframes, prototypes |
| Frontend Developer | Full-time | Week 3-20 | UI implementation |
| Product Owner | 1 dag/week | Week 1-20 | Design reviews & feedback |
| Stakeholders | 2 uur/week | Week 1-20 | Review sessions |

### Design Deliverables Timeline
| Week | Deliverable | Dependency | Critical Path |
|------|------------|------------|---------------|
| 1-2 | User journey maps & wireframes | User research | Yes |
| 3-4 | Design system & component library | Brand guidelines | Yes |
| 3-4 | Annotation Canvas detailed design | Technical feasibility | Yes |
| 5-6 | High-fidelity mockups | Stakeholder feedback | Yes |
| 5-6 | Interactive Figma prototype | Wireframe approval | Yes |
| 7-8 | Design tokens export | Frontend setup | Yes |
| 9-12 | Operator interface design | User testing | Yes |
| 13-16 | Responsive designs | Device testing | No |
| 17-20 | Design QA & documentation | Implementation complete | No |

## 10.4 Technical Design Dependencies

### Frontend Stack Dependencies
```json
{
  "dependencies": {
    "react": "18.3.1",
    "typescript": "5.7.2",
    "antd": "5.22.5",
    "zustand": "5.0.2",
    "tailwindcss": "3.4.17",
    "@ant-design/icons": "^5.5.2",
    "@ant-design/pro-components": "^2.8.0",
    "framer-motion": "^11.0.0",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@storybook/react": "^8.0.0",
    "figma-api": "^1.11.0",
    "style-dictionary": "^3.9.0"
  }
}
```

### Design Tools & Platforms
- **Figma Professional** - Design & prototyping (€15/editor/maand)
- **Storybook** - Component documentation
- **Chromatic** - Visual regression testing (optional)
- **Zeplin** - Design handoff (optional, €19/maand)
- **Abstract** - Version control voor design (optional)

## 10.5 Approval Gates

| Gate | Approver | Criteria | Timeline |
|------|----------|----------|----------|
| Design System Approval | Sarah Chen (Tech) | Technical feasibility | Week 4 |
| User Flow Approval | Jan de Vries (Business) | Business requirements met | Week 2 |
| Operator Interface | Mike Johnson (Operations) | Usability for operators | Week 12 |
| Accessibility Review | Compliance Team | WCAG 2.1 AA compliance | Week 10 |
| Final Design Sign-off | All Stakeholders | Complete prototype review | Week 16 |

---
