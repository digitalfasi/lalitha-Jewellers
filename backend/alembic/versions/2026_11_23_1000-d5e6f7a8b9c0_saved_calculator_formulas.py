"""saved calculator formulas

Revision ID: d5e6f7a8b9c0
Revises: c4d2e3f6a7b8
Create Date: 2026-11-23 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'c4d2e3f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'calc_formulas',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('formula', sa.String(length=500), nullable=False),
        sa.Column('hint', sa.String(length=200), nullable=True),
        sa.Column('sort', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by_name', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id', name='pk_calc_formulas'),
        sa.UniqueConstraint('name', name='uq_calc_formulas_name'),
    )


def downgrade() -> None:
    op.drop_table('calc_formulas')
